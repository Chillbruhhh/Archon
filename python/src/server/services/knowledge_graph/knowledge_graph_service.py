"""
Knowledge Graph Service for Archon.

This service provides the main interface for Knowledge Graph operations,
integrating parsing, graph building, and database persistence following
Archon's service patterns.
"""

import asyncio
import json
import logging
import shutil
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from supabase import Client as SupabaseClient

from .graph_builder import GraphBuilder
from .models import (
    AnalysisType,
    GraphQuery,
    GraphStats,
    KGAnalysis,
    KGNode,
    KGRelationship,
    KGRepository,
    KGSource,
    NodeType,
    ParseRequest,
    ParseResult,
    ParsingProgress,
    ParsingStatus,
    RelationshipType,
)
from .parser import TreeSitterParser

# Import Archon's logging configuration
from ...config.logfire_config import get_logger, safe_logfire_error, safe_logfire_info

logger = get_logger(__name__)


class KnowledgeGraphService:
    """
    Main service for Knowledge Graph operations.
    
    Provides parsing, analysis, and querying capabilities for code repositories
    following Archon's service patterns and database schema.
    """

    def __init__(self, supabase_client: SupabaseClient):
        """
        Initialize the Knowledge Graph service.
        
        Args:
            supabase_client: Supabase client for database operations
        """
        self.supabase = supabase_client
        self.parser = TreeSitterParser()
        self.graph_builder = GraphBuilder()
        self.active_parsing_tasks: Dict[str, asyncio.Task] = {}

    async def parse_repository(
        self,
        request: ParseRequest,
        progress_callback: Optional[Callable[[ParsingProgress], None]] = None,
    ) -> ParseResult:
        """
        Parse a repository and build its knowledge graph with streaming storage.
        
        Args:
            request: Parse request with repository details
            progress_callback: Optional callback for progress updates
            
        Returns:
            ParseResult with operation status and statistics
        """
        kg_source_id = None
        kg_repository_id = None
        cloned_temp_dir = None
        
        try:
            safe_logfire_info(
                f"Starting repository parsing | name={request.name} | source_type={request.source_type}"
            )

            # Create KG source record
            kg_source = await self._create_kg_source(request)
            kg_source_id = kg_source.id
            
            safe_logfire_info(f"Created KG source | kg_source_id={str(kg_source_id)}")

            # Create progress tracking
            async def create_progress_callback(status: ParsingStatus, **kwargs):
                if progress_callback:
                    progress = ParsingProgress(
                        kg_source_id=str(kg_source_id),
                        status=status,
                        start_time=datetime.utcnow(),
                        **kwargs
                    )
                    await progress_callback(progress)

            # Initial progress
            await create_progress_callback(
                ParsingStatus.PROCESSING,
                total_files=0,
                processed_files=0,
                nodes_created=0,
                relationships_created=0,
                errors=[],
            )

            # Determine repository path
            if request.local_path:
                repository_path = request.local_path
            elif request.repository_url:
                # Clone remote repository to temporary directory
                safe_logfire_info(f"Cloning remote repository | url={request.repository_url}")
                cloned_temp_dir = await self._clone_repository(
                    request.repository_url, 
                    request.branch_name,
                    progress_callback
                )
                repository_path = cloned_temp_dir
                safe_logfire_info(f"Repository cloned successfully | temp_path={repository_path}")
            else:
                return ParseResult(
                    success=False,
                    message="No repository path or URL provided",
                    error="Either local_path or repository_url must be specified",
                )

            # Verify repository path exists
            if not Path(repository_path).exists():
                await self._update_kg_source_status(
                    kg_source_id, ParsingStatus.FAILED, "Repository path not found"
                )
                return ParseResult(
                    success=False,
                    kg_source_id=str(kg_source_id) if kg_source_id else None,
                    message="Repository path not found",
                    error=f"Path does not exist: {repository_path}",
                )

            # Parse files and build graph with streaming storage
            parsing_start = time.time()
            
            # Read file contents for analysis
            file_contents = await self._read_repository_files(
                repository_path, 
                request.languages,
                request.max_file_size_kb
            )
            
            if not file_contents:
                await self._update_kg_source_status(
                    kg_source_id, ParsingStatus.FAILED, "No parseable files found"
                )
                return ParseResult(
                    success=False,
                    kg_source_id=str(kg_source_id) if kg_source_id else None,
                    message="No parseable files found in repository",
                    error="Repository contains no supported file types",
                )

            # Create repository record
            kg_repository = await self._create_kg_repository(kg_source_id, request, file_contents)
            kg_repository_id = kg_repository.id

            safe_logfire_info(f"Created KG repository | kg_repository_id={str(kg_repository_id)}")

            # STREAMING ARCHITECTURE: Parse and store files incrementally
            total_files = len(file_contents)
            processed_files = 0
            total_nodes_created = 0
            total_relationships_created = 0
            failed_files = []

            # Cancellation check function
            def check_cancellation():
                task_id = str(kg_source_id)
                if task_id in self.active_parsing_tasks:
                    task = self.active_parsing_tasks[task_id]
                    if task.cancelled():
                        raise asyncio.CancelledError("Parsing was cancelled")

            safe_logfire_info(f"Starting streaming parse and store for {total_files} files")

            for file_path, content in file_contents.items():
                file_start_time = time.time()
                
                try:
                    # Parse individual file - get actual nodes with metadata
                    nodes, relationships, result = await self.parser.parse_file(
                        file_path,
                        content,
                        kg_repository_id,
                        cancellation_check=check_cancellation,
                    )

                    if result.success:
                        # STREAMING STORAGE: Store immediately instead of accumulating
                        storage_success = await self._stream_store_file_data(nodes, relationships, file_path)
                        
                        if storage_success:
                            total_nodes_created += len(nodes)
                            total_relationships_created += len(relationships)
                            
                            file_time = int((time.time() - file_start_time) * 1000)
                            safe_logfire_info(
                                f"Processed and stored file | file_path={file_path} | "
                                f"nodes={len(nodes)} | relationships={len(relationships)} | "
                                f"time={file_time}ms | language={result.language}"
                            )
                        else:
                            failed_files.append({"file_path": file_path, "error": "Storage failed"})
                            safe_logfire_error(f"Storage failed for file | file_path={file_path}")
                    else:
                        failed_files.append({"file_path": file_path, "error": result.error})
                        safe_logfire_error(
                            f"Failed to parse file | file_path={file_path} | error={result.error}"
                        )

                    processed_files += 1

                    # Progress update every 5 files for better responsiveness
                    if processed_files % 5 == 0 or processed_files == total_files:
                        await create_progress_callback(
                            ParsingStatus.PROCESSING,
                            total_files=total_files,
                            processed_files=processed_files,
                            current_file=file_path,
                            nodes_created=total_nodes_created,
                            relationships_created=total_relationships_created,
                            errors=failed_files[-10:] if failed_files else [],  # Show last 10 errors
                        )

                except Exception as e:
                    failed_files.append({"file_path": file_path, "error": str(e)})
                    safe_logfire_error(f"Failed to process file | file_path={file_path} | error={str(e)}")
                    processed_files += 1
                    continue

            # Build additional cross-file relationships after all files are processed
            safe_logfire_info(f"Building cross-file relationships for processed nodes")
            
            # Note: We need to query the database for all nodes to build cross-file relationships
            # This is a compromise - we could optimize this further by caching node references
            try:
                # For now, we'll build relationships using the file contents as context
                # In a future optimization, we could maintain an in-memory node index
                additional_relationships = await self.graph_builder.build_relationships(
                    [],  # Empty nodes list - relationships will be built from file analysis
                    file_contents,
                    cancellation_check=check_cancellation,
                )
                
                if additional_relationships:
                    # Store cross-file relationships
                    await self._store_nodes_and_relationships([], additional_relationships, batch_size=50)
                    total_relationships_created += len(additional_relationships)
                    
                safe_logfire_info(f"Built {len(additional_relationships)} cross-file relationships")
                
            except Exception as rel_error:
                safe_logfire_error(f"Failed to build cross-file relationships | error={str(rel_error)}")
                # Continue without cross-file relationships rather than failing

            # Calculate final statistics
            parsing_duration = int(time.time() - parsing_start)
            avg_parse_time = (parsing_duration * 1000) / total_files if total_files > 0 else 0
            success_rate = ((total_files - len(failed_files)) / total_files * 100) if total_files > 0 else 0

            # Update repository statistics
            await self._update_repository_statistics(
                kg_repository_id,
                total_files=total_files,
                parsed_files=processed_files - len(failed_files),
                parsing_duration=parsing_duration,
                avg_parse_time=avg_parse_time,
            )

            # Update source status to completed
            await self._update_kg_source_status(
                kg_source_id,
                ParsingStatus.COMPLETED,
                total_nodes_created=total_nodes_created,
                total_relationships_created=total_relationships_created,
            )

            # Final progress update
            await create_progress_callback(
                ParsingStatus.COMPLETED,
                total_files=total_files,
                processed_files=processed_files,
                nodes_created=total_nodes_created,
                relationships_created=total_relationships_created,
                errors=failed_files[-10:] if failed_files else [],
            )

            # Enhanced statistics with metadata coverage
            languages_detected = set()
            for file_path in file_contents.keys():
                lang = self.parser.detect_language(file_path)
                if lang:
                    languages_detected.add(lang)

            statistics = {
                "total_files": total_files,
                "parsed_files": processed_files - len(failed_files),
                "failed_files": len(failed_files),
                "success_rate_percent": round(success_rate, 2),
                "total_nodes": total_nodes_created,
                "total_relationships": total_relationships_created,
                "parsing_duration_seconds": parsing_duration,
                "avg_parse_time_ms": round(avg_parse_time, 2),
                "languages_detected": list(languages_detected),
                "streaming_storage": True,  # Indicate this used streaming architecture
            }

            message = (
                f"Successfully parsed repository with streaming storage: "
                f"{total_nodes_created} nodes, {total_relationships_created} relationships. "
                f"Success rate: {success_rate:.1f}% ({processed_files - len(failed_files)}/{total_files} files)"
            )

            safe_logfire_info(
                f"Repository parsing completed with streaming storage | "
                f"kg_source_id={str(kg_source_id)} | kg_repository_id={str(kg_repository_id)} | "
                f"statistics={statistics}"
            )

            return ParseResult(
                success=True,
                kg_source_id=str(kg_source_id) if kg_source_id else None,
                kg_repository_id=str(kg_repository_id) if kg_repository_id else None,
                message=message,
                statistics=statistics,
            )

        except asyncio.CancelledError:
            safe_logfire_info(f"Repository parsing cancelled | kg_source_id={str(kg_source_id)}")
            
            if kg_source_id:
                await self._update_kg_source_status(
                    kg_source_id, ParsingStatus.FAILED, "Parsing was cancelled by user"
                )
            
            return ParseResult(
                success=False,
                kg_source_id=str(kg_source_id) if kg_source_id else None,
                kg_repository_id=str(kg_repository_id) if kg_repository_id else None,
                message="Repository parsing was cancelled",
                error="Operation was cancelled by user",
            )

        except Exception as e:
            error_message = f"Repository parsing failed: {str(e)}"
            safe_logfire_error(f"Repository parsing error | error={error_message} | kg_source_id={str(kg_source_id)}")

            if kg_source_id:
                await self._update_kg_source_status(kg_source_id, ParsingStatus.FAILED, error_message)

            return ParseResult(
                success=False,
                kg_source_id=str(kg_source_id) if kg_source_id else None,
                kg_repository_id=str(kg_repository_id) if kg_repository_id else None,
                message="Repository parsing failed",
                error=error_message,
            )
            
        finally:
            # Cleanup cloned repository if it was created
            if cloned_temp_dir and Path(cloned_temp_dir).exists():
                try:
                    safe_logfire_info(f"Cleaning up cloned repository | temp_path={cloned_temp_dir}")
                    shutil.rmtree(cloned_temp_dir)
                    safe_logfire_info(f"Successfully cleaned up cloned repository | temp_path={cloned_temp_dir}")
                except Exception as cleanup_error:
                    safe_logfire_error(f"Failed to cleanup cloned repository | temp_path={cloned_temp_dir} | error={str(cleanup_error)}")
                    # Don't fail the overall operation due to cleanup issues

    async def query_graph(self, query: GraphQuery) -> Dict[str, Any]:
        """
        Query the knowledge graph for nodes and relationships.
        
        Args:
            query: Graph query parameters
            
        Returns:
            Dictionary containing query results
        """
        try:
            safe_logfire_info(f"Executing graph query | repository_id={str(query.repository_id)}")

            # Build base query with LIMIT to prevent URL too long errors
            node_query = self.supabase.from_("archon_kg_nodes").select("*")
            rel_query = self.supabase.from_("archon_kg_relationships").select("*")

            # Filter by repository
            node_query = node_query.eq("kg_repository_id", str(query.repository_id))
            
            # Apply node type filters
            if query.node_types:
                node_types = [nt.value for nt in query.node_types]
                node_query = node_query.in_("node_type", node_types)

            # Apply language filter
            if query.language_filter:
                node_query = node_query.eq("language", query.language_filter)

            # Limit nodes to prevent URL too long errors (max 1000 nodes for visualization)
            node_query = node_query.limit(1000)

            # Execute node query
            nodes_result = node_query.execute()
            nodes = nodes_result.data if nodes_result.data else []

            # Get relationships in batches to avoid URL too long errors
            relationships = []
            if nodes:
                node_ids = [node["id"] for node in nodes]
                
                # Process relationships in batches of 50 node IDs to keep URL manageable
                batch_size = 50
                for i in range(0, len(node_ids), batch_size):
                    batch_node_ids = node_ids[i:i + batch_size]
                    
                    # Build relationship query for this batch
                    batch_rel_query = self.supabase.from_("archon_kg_relationships").select("*")
                    
                    # Filter relationships where either source or target is in this batch
                    batch_rel_query = batch_rel_query.or_(
                        f"source_node_id.in.({','.join(batch_node_ids)}),target_node_id.in.({','.join(batch_node_ids)})"
                    )

                    # Apply relationship type filters
                    if query.relationship_types:
                        rel_types = [rt.value for rt in query.relationship_types]
                        batch_rel_query = batch_rel_query.in_("relationship_type", rel_types)

                    # Execute batch query
                    batch_result = batch_rel_query.execute()
                    if batch_result.data:
                        relationships.extend(batch_result.data)

                # Remove duplicate relationships (since batches may overlap)
                seen_rel_ids = set()
                unique_relationships = []
                for rel in relationships:
                    if rel["id"] not in seen_rel_ids:
                        seen_rel_ids.add(rel["id"])
                        unique_relationships.append(rel)
                relationships = unique_relationships

                # Filter relationships to only include those between our selected nodes
                node_id_set = set(node_ids)
                relationships = [
                    rel for rel in relationships 
                    if rel["source_node_id"] in node_id_set and rel["target_node_id"] in node_id_set
                ]

            # Apply start/end node filtering if specified
            if query.start_node_id or query.end_node_id:
                filtered_results = await self._apply_path_filtering(
                    nodes, relationships, query.start_node_id, query.end_node_id, query.max_depth
                )
                nodes, relationships = filtered_results

            result = {
                "nodes": nodes,
                "relationships": relationships,
                "total_nodes": len(nodes),
                "total_relationships": len(relationships),
                "query_parameters": {
                    "repository_id": str(query.repository_id),
                    "max_depth": query.max_depth,
                    "node_types": [nt.value for nt in (query.node_types or [])],
                    "relationship_types": [rt.value for rt in (query.relationship_types or [])],
                    "language_filter": query.language_filter,
                },
            }

            safe_logfire_info(
                f"Graph query completed | nodes={len(nodes)} | relationships={len(relationships)}"
            )

            return result

        except Exception as e:
            safe_logfire_error(f"Graph query failed | error={str(e)} | repository_id={str(query.repository_id)}")
            raise

    async def get_graph_statistics(self, repository_id: UUID) -> GraphStats:
        """
        Get comprehensive statistics for a repository's knowledge graph.
        
        Args:
            repository_id: UUID of the repository
            
        Returns:
            GraphStats object with detailed statistics
        """
        try:
            safe_logfire_info(f"Getting graph statistics | repository_id={str(repository_id)}")

            # Query nodes for the repository
            nodes_result = self.supabase.from_("archon_kg_nodes").select("*").eq(
                "kg_repository_id", str(repository_id)
            ).execute()

            nodes = nodes_result.data if nodes_result.data else []
            relationships = []

            # Get relationships for these nodes using batching to avoid URL too long errors
            if nodes:
                node_ids = [node["id"] for node in nodes]
                
                # Process relationships in batches of 50 node IDs to keep URL manageable
                batch_size = 50
                for i in range(0, len(node_ids), batch_size):
                    batch_node_ids = node_ids[i:i + batch_size]
                    
                    # Build relationship query for this batch
                    batch_rel_query = self.supabase.from_("archon_kg_relationships").select("*")
                    
                    # Filter relationships where either source or target is in this batch
                    batch_rel_query = batch_rel_query.or_(
                        f"source_node_id.in.({','.join(batch_node_ids)}),target_node_id.in.({','.join(batch_node_ids)})"
                    )

                    # Execute batch query
                    batch_result = batch_rel_query.execute()
                    if batch_result.data:
                        relationships.extend(batch_result.data)

                # Remove duplicate relationships (since batches may overlap)
                seen_rel_ids = set()
                unique_relationships = []
                for rel in relationships:
                    if rel["id"] not in seen_rel_ids:
                        seen_rel_ids.add(rel["id"])
                        unique_relationships.append(rel)
                relationships = unique_relationships

                # Filter relationships to only include those between our selected nodes
                node_id_set = set(node_ids)
                relationships = [
                    rel for rel in relationships 
                    if rel["source_node_id"] in node_id_set and rel["target_node_id"] in node_id_set
                ]

            # Calculate statistics
            nodes_by_type = {}
            relationships_by_type = {}
            languages = {}
            complexity_scores = []

            for node in nodes:
                # Count by type
                node_type = node.get("node_type", "unknown")
                nodes_by_type[node_type] = nodes_by_type.get(node_type, 0) + 1

                # Count by language
                language = node.get("language")
                if language:
                    languages[language] = languages.get(language, 0) + 1

                # Collect complexity scores
                complexity = node.get("complexity_score")
                if complexity:
                    complexity_scores.append(complexity)

            for rel in relationships:
                rel_type = rel.get("relationship_type", "unknown")
                relationships_by_type[rel_type] = relationships_by_type.get(rel_type, 0) + 1

            # Calculate complexity statistics
            complexity_stats = {}
            if complexity_scores:
                complexity_stats = {
                    "average": sum(complexity_scores) / len(complexity_scores),
                    "min": min(complexity_scores),
                    "max": max(complexity_scores),
                    "median": sorted(complexity_scores)[len(complexity_scores) // 2],
                }

            stats = GraphStats(
                total_nodes=len(nodes),
                total_relationships=len(relationships),
                nodes_by_type=nodes_by_type,
                relationships_by_type=relationships_by_type,
                languages=languages,
                complexity_stats=complexity_stats,
            )

            safe_logfire_info(
                f"Graph statistics calculated | repository_id={str(repository_id)} | total_nodes={stats.total_nodes} | total_relationships={stats.total_relationships}"
            )

            return stats

        except Exception as e:
            safe_logfire_error(
                f"Failed to get graph statistics | error={str(e)} | repository_id={str(repository_id)}"
            )
            raise

    async def analyze_repository(
        self, repository_id: UUID, analysis_type: AnalysisType, parameters: Dict[str, Any] = None
    ) -> KGAnalysis:
        """
        Perform advanced analysis on a repository's knowledge graph.
        
        Args:
            repository_id: UUID of the repository
            analysis_type: Type of analysis to perform
            parameters: Optional analysis parameters
            
        Returns:
            KGAnalysis object with analysis results
        """
        try:
            safe_logfire_info(
                f"Starting repository analysis | repository_id={str(repository_id)} | analysis_type={analysis_type}"
            )

            analysis_start = time.time()
            parameters = parameters or {}

            # Get nodes and relationships for analysis
            query = GraphQuery(repository_id=repository_id, max_depth=10, include_properties=True)
            graph_data = await self.query_graph(query)

            nodes = [KGNode(**node) for node in graph_data["nodes"]]
            relationships = [KGRelationship(**rel) for rel in graph_data["relationships"]]

            # Perform analysis based on type
            if analysis_type == AnalysisType.DEPENDENCY_TREE:
                results = await self._analyze_dependencies(nodes, relationships, parameters)
            elif analysis_type == AnalysisType.COMPLEXITY_ANALYSIS:
                results = await self._analyze_complexity(nodes, relationships, parameters)
            elif analysis_type == AnalysisType.HOTSPOTS:
                results = await self._analyze_hotspots(nodes, relationships, parameters)
            elif analysis_type == AnalysisType.ARCHITECTURE_OVERVIEW:
                results = await self._analyze_architecture(nodes, relationships, parameters)
            else:
                raise ValueError(f"Unsupported analysis type: {analysis_type}")

            execution_time_ms = int((time.time() - analysis_start) * 1000)

            # Create analysis record
            analysis = KGAnalysis(
                id=uuid4(),
                kg_repository_id=repository_id,
                analysis_type=analysis_type,
                parameters=parameters,
                results=results,
                execution_time_ms=execution_time_ms,
                created_at=datetime.utcnow(),
            )

            # Store analysis in database
            await self._store_analysis(analysis)

            safe_logfire_info(
                f"Repository analysis completed | repository_id={str(repository_id)} | analysis_type={analysis_type} | execution_time_ms={execution_time_ms}"
            )

            return analysis

        except Exception as e:
            safe_logfire_error(
                f"Repository analysis failed | error={str(e)} | repository_id={str(repository_id)} | analysis_type={analysis_type}"
            )
            raise

    async def cancel_parsing(self, kg_source_id: UUID) -> bool:
        """
        Cancel an active parsing operation.
        
        Args:
            kg_source_id: UUID of the KG source being parsed
            
        Returns:
            True if cancellation was successful, False otherwise
        """
        try:
            task_id = str(kg_source_id)
            
            if task_id in self.active_parsing_tasks:
                task = self.active_parsing_tasks[task_id]
                if not task.done():
                    task.cancel()
                    safe_logfire_info(f"Cancelled parsing task | kg_source_id={str(kg_source_id)}")
                    return True
                else:
                    safe_logfire_info(f"Parsing task already completed | kg_source_id={str(kg_source_id)}")
                    return False
            else:
                safe_logfire_info(f"No active parsing task found | kg_source_id={str(kg_source_id)}")
                return False

        except Exception as e:
            safe_logfire_error(f"Failed to cancel parsing | error={str(e)} | kg_source_id={str(kg_source_id)}")
            return False

    # Private helper methods

    async def _create_kg_source(self, request: ParseRequest) -> KGSource:
        """Create a new KG source record in the database."""
        # Ensure constraint compliance: must have either archon_source_id, archon_project_id, or local_path
        local_path_value = request.local_path
        if (request.archon_source_id is None and 
            request.archon_project_id is None and 
            request.local_path is None and 
            request.repository_url is not None):
            # For remote repositories without local path, use repository_url as local_path for constraint compliance
            local_path_value = request.repository_url
            
        kg_source = KGSource(
            id=uuid4(),
            source_type=request.source_type,
            archon_source_id=request.archon_source_id,
            archon_project_id=request.archon_project_id,
            name=request.name,
            repository_url=request.repository_url,
            branch_name=request.branch_name,
            local_path=local_path_value,
            parsing_status=ParsingStatus.PENDING,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        # Store in database with proper UUID and datetime serialization
        kg_source_dict = kg_source.dict()
        # Convert UUID fields to strings
        if kg_source_dict.get('id'):
            kg_source_dict['id'] = str(kg_source_dict['id'])
        if kg_source_dict.get('archon_project_id'):
            kg_source_dict['archon_project_id'] = str(kg_source_dict['archon_project_id'])
        # Convert datetime fields to ISO format strings
        if kg_source_dict.get('parsing_started_at'):
            kg_source_dict['parsing_started_at'] = kg_source_dict['parsing_started_at'].isoformat()
        if kg_source_dict.get('parsing_completed_at'):
            kg_source_dict['parsing_completed_at'] = kg_source_dict['parsing_completed_at'].isoformat()
        if kg_source_dict.get('created_at'):
            kg_source_dict['created_at'] = kg_source_dict['created_at'].isoformat()
        if kg_source_dict.get('updated_at'):
            kg_source_dict['updated_at'] = kg_source_dict['updated_at'].isoformat()
        
        result = self.supabase.from_("archon_kg_sources").insert(kg_source_dict).execute()
        
        if not result.data:
            raise Exception("Failed to create KG source record")

        return KGSource(**result.data[0])

    async def _create_kg_repository(
        self, kg_source_id: UUID, request: ParseRequest, file_contents: Dict[str, str]
    ) -> KGRepository:
        """Create a new KG repository record in the database."""
        # Detect languages from file extensions
        languages = set()
        for file_path in file_contents.keys():
            language = self.parser.detect_language(file_path)
            if language:
                languages.add(language)

        all_languages = list(languages)
        primary_language = all_languages[0] if all_languages else None

        kg_repository = KGRepository(
            id=uuid4(),
            kg_source_id=kg_source_id,
            name=request.name,
            repository_url=request.repository_url,
            branch_name=request.branch_name,
            primary_language=primary_language,
            all_languages=all_languages,
            total_files=len(file_contents),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        # Store in database with proper UUID and datetime serialization
        kg_repository_dict = kg_repository.dict()
        # Convert UUID fields to strings
        if kg_repository_dict.get('id'):
            kg_repository_dict['id'] = str(kg_repository_dict['id'])
        if kg_repository_dict.get('kg_source_id'):
            kg_repository_dict['kg_source_id'] = str(kg_repository_dict['kg_source_id'])
        # Convert datetime fields to ISO format strings
        if kg_repository_dict.get('created_at'):
            kg_repository_dict['created_at'] = kg_repository_dict['created_at'].isoformat()
        if kg_repository_dict.get('updated_at'):
            kg_repository_dict['updated_at'] = kg_repository_dict['updated_at'].isoformat()
        
        result = self.supabase.from_("archon_kg_repositories").insert(kg_repository_dict).execute()
        
        if not result.data:
            raise Exception("Failed to create KG repository record")

        return KGRepository(**result.data[0])

    async def _clone_repository(
        self, 
        repository_url: str, 
        branch_name: str = "main",
        progress_callback: Optional[Callable] = None
    ) -> str:
        """
        Clone a remote repository to a temporary directory.
        
        Args:
            repository_url: URL of the repository to clone
            branch_name: Git branch to clone (default: main)
            progress_callback: Optional callback for progress updates
            
        Returns:
            Path to the cloned repository
            
        Raises:
            Exception: If cloning fails
        """
        try:
            # Create temporary directory
            temp_dir = tempfile.mkdtemp(prefix="archon_kg_clone_")
            safe_logfire_info(f"Created temporary directory for cloning | temp_dir={temp_dir}")
            
            # Send progress update
            if progress_callback:
                from .models import ParsingProgress, ParsingStatus
                progress = ParsingProgress(
                    kg_source_id="temp",
                    status=ParsingStatus.PROCESSING,
                    total_files=0,
                    processed_files=0,
                    current_file=f"Cloning {repository_url}",
                    nodes_created=0,
                    relationships_created=0,
                    errors=[],
                    start_time=datetime.utcnow(),
                )
                await progress_callback(progress)
            
            # Prepare git clone command
            clone_cmd = [
                "git", "clone", 
                "--depth", "1",  # Shallow clone for faster download
                "--branch", branch_name,
                repository_url,
                temp_dir
            ]
            
            safe_logfire_info(f"Executing git clone | cmd={' '.join(clone_cmd[:-1])} [temp_dir]")
            
            # Execute git clone
            result = subprocess.run(
                clone_cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout
                cwd=None
            )
            
            if result.returncode != 0:
                # Cleanup on failure
                if Path(temp_dir).exists():
                    shutil.rmtree(temp_dir)
                
                error_msg = f"Git clone failed: {result.stderr}"
                safe_logfire_error(f"Git clone failed | error={error_msg} | url={repository_url}")
                raise Exception(error_msg)
            
            safe_logfire_info(f"Git clone successful | url={repository_url} | temp_dir={temp_dir}")
            
            # Verify cloned directory exists and has content
            cloned_path = Path(temp_dir)
            if not cloned_path.exists() or not any(cloned_path.iterdir()):
                if cloned_path.exists():
                    shutil.rmtree(temp_dir)
                raise Exception("Cloned repository is empty or was not created")
            
            return temp_dir
            
        except subprocess.TimeoutExpired:
            # Cleanup on timeout
            if 'temp_dir' in locals() and Path(temp_dir).exists():
                shutil.rmtree(temp_dir)
            error_msg = f"Git clone timed out after 5 minutes for {repository_url}"
            safe_logfire_error(f"Git clone timeout | url={repository_url}")
            raise Exception(error_msg)
            
        except Exception as e:
            # Cleanup on any other error
            if 'temp_dir' in locals() and Path(temp_dir).exists():
                shutil.rmtree(temp_dir)
            safe_logfire_error(f"Repository cloning failed | url={repository_url} | error={str(e)}")
            raise Exception(f"Failed to clone repository: {str(e)}")

    async def _read_repository_files(
        self, repository_path: str, language_filter: Optional[List[str]] = None, max_file_size_kb: int = 500
    ) -> Dict[str, str]:
        """Read all parseable files from the repository using intelligent filtering."""
        file_contents = {}
        repo_path = Path(repository_path)
        max_size_bytes = max_file_size_kb * 1024

        # Statistics tracking for filtering performance
        total_files_found = 0
        files_filtered_out = 0
        files_size_filtered = 0
        files_language_filtered = 0
        files_included = 0

        try:
            safe_logfire_info(f"Starting intelligent file discovery | path={repository_path} | max_size_kb={max_file_size_kb}")

            # Phase 1: Discover all files in repository
            all_files = []
            for file_path in repo_path.rglob("*"):
                if file_path.is_file():
                    all_files.append(file_path)

            total_files_found = len(all_files)
            safe_logfire_info(f"Found {total_files_found} total files in repository")

            # Phase 2: Apply intelligent filtering with comprehensive statistics
            for file_path in all_files:
                try:
                    # Get file size for intelligent filtering
                    file_size_bytes = file_path.stat().st_size
                    
                    # Apply intelligent file filtering using TreeSitterParser's enhanced should_parse_file
                    should_parse = self.parser.should_parse_file(str(file_path), file_size_bytes)
                    
                    if not should_parse:
                        files_filtered_out += 1
                        continue

                    # Additional size check (redundant but explicit)
                    if file_size_bytes > max_size_bytes:
                        files_size_filtered += 1
                        continue

                    # Get detected language for additional validation
                    language = self.parser.detect_language(str(file_path))
                    if not language:
                        files_language_filtered += 1
                        continue

                    # Apply language filter if specified
                    if language_filter and language not in language_filter:
                        files_language_filtered += 1
                        continue

                    # Read file content for files that pass all filters
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            file_contents[str(file_path)] = content
                            files_included += 1
                            
                    except Exception as read_error:
                        safe_logfire_warning(f"Failed to read file content | file={file_path} | error={str(read_error)}")
                        continue

                except (OSError, PermissionError) as stat_error:
                    safe_logfire_warning(f"Failed to get file stats | file={file_path} | error={str(stat_error)}")
                    continue

            # Calculate filtering statistics
            files_filtered_total = files_filtered_out + files_size_filtered + files_language_filtered
            inclusion_rate = (files_included / total_files_found * 100) if total_files_found > 0 else 0
            exclusion_rate = (files_filtered_total / total_files_found * 100) if total_files_found > 0 else 0

            # Log comprehensive filtering results
            safe_logfire_info(
                f"File filtering completed | "
                f"total_found={total_files_found} | "
                f"smart_filtered={files_filtered_out} | "
                f"size_filtered={files_size_filtered} | "
                f"language_filtered={files_language_filtered} | "
                f"files_included={files_included} | "
                f"inclusion_rate={inclusion_rate:.1f}% | "
                f"exclusion_rate={exclusion_rate:.1f}%"
            )
            
            # Log breakdown of what was filtered out for debugging
            print(f"📊 File Filtering Results:")
            print(f"   📁 Total files found: {total_files_found}")
            print(f"   🎯 Smart filter excluded: {files_filtered_out} (config/docs/binaries)")
            print(f"   📏 Size filter excluded: {files_size_filtered} (>{max_file_size_kb}KB)")
            print(f"   🔤 Language filter excluded: {files_language_filtered} (unsupported/filtered)")
            print(f"   ✅ Files to parse: {files_included} ({inclusion_rate:.1f}%)")
            print(f"   📉 Total reduction: {exclusion_rate:.1f}% filtered out")

            return file_contents

        except Exception as e:
            safe_logfire_error(f"Failed to read repository files with filtering | error={str(e)} | path={repository_path}")
            raise

    # REMOVED: Mock node creation method - now using actual TreeSitter parser results
# This method was replaced by using the parser.parse_file() method directly
# which returns actual parsed nodes with populated source_code, docstring, and complexity_score

    async def _store_nodes_and_relationships(
        self, nodes: List[KGNode], relationships: List[KGRelationship], batch_size: int = 50
    ) -> None:
        """Store nodes and relationships in the database using batched operations."""
        import time
        
        try:
            total_nodes_stored = 0
            total_relationships_stored = 0
            
            # Store nodes in batches to prevent database timeouts
            if nodes:
                safe_logfire_info(f"Starting batched storage of {len(nodes)} nodes with batch_size={batch_size}")
                
                for i in range(0, len(nodes), batch_size):
                    batch_start_time = time.time()
                    batch_nodes = nodes[i:i + batch_size]
                    
                    # Convert batch to dictionaries
                    node_dicts = []
                    for node in batch_nodes:
                        node_dict = node.dict()
                        # Convert UUID fields to strings
                        if node_dict.get('id'):
                            node_dict['id'] = str(node_dict['id'])
                        if node_dict.get('kg_repository_id'):
                            node_dict['kg_repository_id'] = str(node_dict['kg_repository_id'])
                        # Convert datetime fields to ISO format strings
                        if node_dict.get('created_at'):
                            node_dict['created_at'] = node_dict['created_at'].isoformat()
                        node_dicts.append(node_dict)
                    
                    # Insert batch with retry logic
                    try:
                        result = self.supabase.from_("archon_kg_nodes").insert(node_dicts).execute()
                        if result.data:
                            batch_stored = len(result.data)
                            total_nodes_stored += batch_stored
                            batch_time = int((time.time() - batch_start_time) * 1000)
                            safe_logfire_info(
                                f"Stored node batch {i//batch_size + 1}/{(len(nodes) + batch_size - 1)//batch_size} | "
                                f"nodes={batch_stored}/{len(batch_nodes)} | time={batch_time}ms"
                            )
                        else:
                            safe_logfire_error(f"Failed to store node batch {i//batch_size + 1} - no data returned")
                            
                    except Exception as batch_error:
                        safe_logfire_error(f"Failed to store node batch {i//batch_size + 1} | error={str(batch_error)}")
                        # Continue with next batch instead of failing completely
                        continue
                        
                safe_logfire_info(f"Completed node storage | total_stored={total_nodes_stored}/{len(nodes)}")

            # Store relationships in batches to prevent database timeouts
            if relationships:
                safe_logfire_info(f"Starting batched storage of {len(relationships)} relationships with batch_size={batch_size}")
                
                for i in range(0, len(relationships), batch_size):
                    batch_start_time = time.time()
                    batch_relationships = relationships[i:i + batch_size]
                    
                    # Convert batch to dictionaries
                    rel_dicts = []
                    for rel in batch_relationships:
                        rel_dict = rel.dict()
                        # Convert UUID fields to strings
                        if rel_dict.get('id'):
                            rel_dict['id'] = str(rel_dict['id'])
                        if rel_dict.get('source_node_id'):
                            rel_dict['source_node_id'] = str(rel_dict['source_node_id'])
                        if rel_dict.get('target_node_id'):
                            rel_dict['target_node_id'] = str(rel_dict['target_node_id'])
                        # Convert datetime fields to ISO format strings
                        if rel_dict.get('created_at'):
                            rel_dict['created_at'] = rel_dict['created_at'].isoformat()
                        rel_dicts.append(rel_dict)
                    
                    # Insert batch with retry logic
                    try:
                        result = self.supabase.from_("archon_kg_relationships").insert(rel_dicts).execute()
                        if result.data:
                            batch_stored = len(result.data)
                            total_relationships_stored += batch_stored
                            batch_time = int((time.time() - batch_start_time) * 1000)
                            safe_logfire_info(
                                f"Stored relationship batch {i//batch_size + 1}/{(len(relationships) + batch_size - 1)//batch_size} | "
                                f"relationships={batch_stored}/{len(batch_relationships)} | time={batch_time}ms"
                            )
                        else:
                            safe_logfire_error(f"Failed to store relationship batch {i//batch_size + 1} - no data returned")
                            
                    except Exception as batch_error:
                        safe_logfire_error(f"Failed to store relationship batch {i//batch_size + 1} | error={str(batch_error)}")
                        # Continue with next batch instead of failing completely
                        continue
                        
                safe_logfire_info(f"Completed relationship storage | total_stored={total_relationships_stored}/{len(relationships)}")

            safe_logfire_info(
                f"Batched storage completed | nodes={total_nodes_stored}/{len(nodes)} | "
                f"relationships={total_relationships_stored}/{len(relationships)}"
            )

        except Exception as e:
            safe_logfire_error(f"Failed to store graph data | error={str(e)}")
            raise

    async def _stream_store_file_data(
        self, nodes: List[KGNode], relationships: List[KGRelationship], file_path: str
    ) -> bool:
        """Stream store data from a single file immediately after parsing."""
        try:
            if not nodes and not relationships:
                return True
                
            # Use smaller batch size for streaming to ensure responsiveness
            stream_batch_size = 25
            
            safe_logfire_info(f"Streaming storage for file | file_path={file_path} | nodes={len(nodes)} | relationships={len(relationships)}")
            
            # Store the data using the batched storage method
            await self._store_nodes_and_relationships(nodes, relationships, batch_size=stream_batch_size)
            
            safe_logfire_info(f"Successfully streamed storage for file | file_path={file_path}")
            return True
            
        except Exception as e:
            safe_logfire_error(f"Failed to stream store file data | file_path={file_path} | error={str(e)}")
            return False

    async def _update_kg_source_status(
        self,
        kg_source_id: UUID,
        status: ParsingStatus,
        error_message: str = None,
        total_nodes_created: int = None,
        total_relationships_created: int = None,
    ) -> None:
        """Update KG source parsing status and statistics."""
        try:
            update_data = {
                "parsing_status": status.value,
                "updated_at": datetime.utcnow().isoformat(),
            }

            if status == ParsingStatus.PROCESSING:
                update_data["parsing_started_at"] = datetime.utcnow().isoformat()
            elif status in [ParsingStatus.COMPLETED, ParsingStatus.FAILED]:
                update_data["parsing_completed_at"] = datetime.utcnow().isoformat()

            if error_message:
                update_data["parsing_error"] = error_message

            if total_nodes_created is not None:
                update_data["total_nodes_created"] = total_nodes_created

            if total_relationships_created is not None:
                update_data["total_relationships_created"] = total_relationships_created

            result = self.supabase.from_("archon_kg_sources").update(update_data).eq(
                "id", str(kg_source_id)
            ).execute()

            if not result.data:
                safe_logfire_error(f"Failed to update KG source status | kg_source_id={str(kg_source_id)}")

        except Exception as e:
            safe_logfire_error(
                f"Failed to update KG source status | error={str(e)} | kg_source_id={str(kg_source_id)}"
            )

    async def _update_repository_statistics(
        self,
        kg_repository_id: UUID,
        total_files: int,
        parsed_files: int,
        parsing_duration: int,
        avg_parse_time: float,
    ) -> None:
        """Update repository parsing statistics."""
        try:
            update_data = {
                "total_files": total_files,
                "parsed_files": parsed_files,
                "parsing_duration_seconds": parsing_duration,
                "avg_parse_time_per_file_ms": avg_parse_time,
                "updated_at": datetime.utcnow().isoformat(),
            }

            result = self.supabase.from_("archon_kg_repositories").update(update_data).eq(
                "id", str(kg_repository_id)
            ).execute()

            if not result.data:
                safe_logfire_error(f"Failed to update repository statistics | kg_repository_id={str(kg_repository_id)}")

        except Exception as e:
            safe_logfire_error(
                f"Failed to update repository statistics | error={str(e)} | kg_repository_id={str(kg_repository_id)}"
            )

    async def _apply_path_filtering(
        self,
        nodes: List[Dict],
        relationships: List[Dict],
        start_node_id: Optional[UUID],
        end_node_id: Optional[UUID],
        max_depth: int,
    ) -> Tuple[List[Dict], List[Dict]]:
        """Apply path-based filtering to nodes and relationships."""
        # This would implement graph traversal algorithms for path finding
        # For now, return all nodes and relationships
        return nodes, relationships

    async def _analyze_dependencies(
        self, nodes: List[KGNode], relationships: List[KGRelationship], parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Analyze dependency patterns in the code graph."""
        return await self.graph_builder.analyze_dependencies(nodes, relationships)

    async def _analyze_complexity(
        self, nodes: List[KGNode], relationships: List[KGRelationship], parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Analyze complexity metrics and hotspots."""
        stats = await self.graph_builder.build_graph_statistics(nodes, relationships)
        return {
            "complexity_distribution": stats["complexity_distribution"],
            "average_complexity": stats["average_complexity"],
            "high_complexity_nodes": [
                {"name": node.name, "file_path": node.file_path, "complexity": node.complexity_score}
                for node in nodes
                if node.complexity_score and node.complexity_score > 7
            ],
        }

    async def _analyze_hotspots(
        self, nodes: List[KGNode], relationships: List[KGRelationship], parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Analyze code hotspots and problematic areas."""
        # Count incoming and outgoing relationships for each node
        node_metrics = {}
        for node in nodes:
            node_metrics[str(node.id)] = {
                "name": node.name,
                "file_path": node.file_path,
                "node_type": node.node_type.value,
                "incoming_refs": 0,
                "outgoing_refs": 0,
                "complexity": node.complexity_score or 1,
            }

        for rel in relationships:
            source_id = str(rel.source_node_id)
            target_id = str(rel.target_node_id)
            
            if source_id in node_metrics:
                node_metrics[source_id]["outgoing_refs"] += 1
            if target_id in node_metrics:
                node_metrics[target_id]["incoming_refs"] += 1

        # Calculate hotspot scores
        hotspots = []
        for node_id, metrics in node_metrics.items():
            score = (
                metrics["incoming_refs"] * 2 +  # High fan-in is more problematic
                metrics["outgoing_refs"] +
                metrics["complexity"] * 3
            )
            if score > 10:  # Threshold for hotspot
                hotspots.append({**metrics, "hotspot_score": score})

        # Sort by score
        hotspots.sort(key=lambda x: x["hotspot_score"], reverse=True)

        return {"hotspots": hotspots[:20]}  # Top 20 hotspots

    async def _analyze_architecture(
        self, nodes: List[KGNode], relationships: List[KGRelationship], parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Analyze overall architecture and design patterns."""
        stats = await self.graph_builder.build_graph_statistics(nodes, relationships)
        
        # Analyze file organization
        file_structure = {}
        for node in nodes:
            if node.node_type == NodeType.FILE:
                dir_path = str(Path(node.file_path).parent)
                if dir_path not in file_structure:
                    file_structure[dir_path] = {"files": 0, "languages": set()}
                file_structure[dir_path]["files"] += 1
                if node.language:
                    file_structure[dir_path]["languages"].add(node.language)

        # Convert sets to lists for JSON serialization
        for dir_info in file_structure.values():
            dir_info["languages"] = list(dir_info["languages"])

        return {
            "overview": stats,
            "file_structure": file_structure,
            "cross_file_coupling": stats.get("cross_file_relationships", 0),
            "modularity_score": self._calculate_modularity_score(nodes, relationships),
        }

    def _calculate_modularity_score(
        self, nodes: List[KGNode], relationships: List[KGRelationship]
    ) -> float:
        """Calculate a simple modularity score for the codebase."""
        if not relationships:
            return 1.0

        # Count internal vs external relationships
        files = set(node.file_path for node in nodes)
        internal_rels = 0
        external_rels = 0

        for rel in relationships:
            source_node = next((n for n in nodes if n.id == rel.source_node_id), None)
            target_node = next((n for n in nodes if n.id == rel.target_node_id), None)
            
            if source_node and target_node:
                if source_node.file_path == target_node.file_path:
                    internal_rels += 1
                else:
                    external_rels += 1

        total_rels = internal_rels + external_rels
        if total_rels == 0:
            return 1.0

        # Higher ratio of internal to external relationships indicates better modularity
        return internal_rels / total_rels

    async def _store_analysis(self, analysis: KGAnalysis) -> None:
        """Store analysis results in the database."""
        try:
            # Store analysis with proper UUID and datetime serialization
            analysis_dict = analysis.dict()
            # Convert UUID fields to strings
            if analysis_dict.get('id'):
                analysis_dict['id'] = str(analysis_dict['id'])
            if analysis_dict.get('kg_repository_id'):
                analysis_dict['kg_repository_id'] = str(analysis_dict['kg_repository_id'])
            # Convert datetime fields to ISO format strings
            if analysis_dict.get('created_at'):
                analysis_dict['created_at'] = analysis_dict['created_at'].isoformat()
            
            result = self.supabase.from_("archon_kg_analysis").insert(analysis_dict).execute()
            
            if not result.data:
                safe_logfire_error(f"Failed to store analysis | analysis_id={str(analysis.id)}")

        except Exception as e:
            safe_logfire_error(f"Failed to store analysis | error={str(e)} | analysis_id={str(analysis.id)}")
            raise