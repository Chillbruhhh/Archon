"""
Knowledge Graph API Module

This module handles all Knowledge Graph operations including:
- Repository parsing and code analysis
- Graph querying and traversal
- Advanced analytics and insights
- Real-time parsing progress via Socket.IO
"""

import asyncio
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from ..config.logfire_config import get_logger, safe_logfire_error, safe_logfire_info
from ..services.knowledge_graph import (
    GraphQuery,
    GraphStats,
    KnowledgeGraphService,
    ParseRequest,
    ParseResult,
    ParsingProgress,
)
from ..socketio_app import get_socketio_instance
from ..utils import get_supabase_client

# Get logger for this module
logger = get_logger(__name__)

# Create router
router = APIRouter(prefix="/api/knowledge-graph", tags=["knowledge-graph"])

# Get Socket.IO instance
sio = get_socketio_instance()

# Track active parsing tasks for cancellation support
active_parsing_tasks: Dict[str, asyncio.Task] = {}


# Request/Response Models
class ParseRepositoryRequest(BaseModel):
    """Request to parse a repository."""
    source_type: str = "project_repository"
    name: str
    repository_url: Optional[str] = None
    local_path: Optional[str] = None
    branch_name: str = "main"
    archon_source_id: Optional[str] = None
    archon_project_id: Optional[str] = None
    languages: Optional[List[str]] = None
    max_file_size_kb: int = 500
    parse_timeout_seconds: int = 30
    enable_cross_file_refs: bool = True

    class Config:
        schema_extra = {
            "example": {
                "name": "My Project Repository",
                "repository_url": "https://github.com/user/repo",
                "branch_name": "main",
                "languages": ["python", "javascript"],
                "max_file_size_kb": 500,
                "enable_cross_file_refs": True
            }
        }


class GraphQueryRequest(BaseModel):
    """Request to query the knowledge graph."""
    repository_id: str
    start_node_id: Optional[str] = None
    end_node_id: Optional[str] = None
    relationship_types: List[str] = []
    max_depth: int = 3
    node_types: Optional[List[str]] = None
    language_filter: Optional[str] = None
    include_properties: bool = False

    class Config:
        schema_extra = {
            "example": {
                "repository_id": "550e8400-e29b-41d4-a716-446655440000",
                "max_depth": 3,
                "relationship_types": ["calls", "imports"],
                "include_properties": False
            }
        }


class AnalysisRequest(BaseModel):
    """Request to perform repository analysis."""
    repository_id: str
    analysis_type: str  # dependency_tree, complexity_analysis, hotspots, architecture_overview
    parameters: Dict[str, Any] = {}

    class Config:
        schema_extra = {
            "example": {
                "repository_id": "550e8400-e29b-41d4-a716-446655440000",
                "analysis_type": "complexity_analysis",
                "parameters": {"threshold": 5}
            }
        }


# Import Socket.IO handlers
from .socketio_handlers import (
    start_kg_parsing_progress as start_parsing_progress,
    update_kg_parsing_progress as update_parsing_progress,
    complete_kg_parsing_progress as complete_parsing_progress,
    error_kg_parsing_progress as error_parsing_progress,
    cancel_kg_parsing_progress as cancel_parsing_progress,
)


# API Endpoints

@router.get("/health")
async def knowledge_graph_health():
    """Knowledge Graph API health check."""
    return {
        "status": "healthy",
        "service": "knowledge-graph-api",
        "timestamp": datetime.utcnow().isoformat(),
        "features": [
            "repository_parsing",
            "graph_querying",
            "advanced_analytics",
            "real_time_progress"
        ]
    }


@router.post("/parse", response_model=Dict[str, Any])
async def parse_repository(
    request: ParseRepositoryRequest,
    background_tasks: BackgroundTasks
):
    """
    Parse a repository and build its knowledge graph.
    
    This endpoint starts the parsing process in the background and returns
    a parsing ID for tracking progress via Socket.IO events.
    """
    try:
        safe_logfire_info(
            f"Starting repository parsing | name={request.name} | source_type={request.source_type}"
        )

        # Generate unique parsing ID
        parsing_id = str(uuid.uuid4())

        # Convert request to ParseRequest model
        parse_request = ParseRequest(
            source_type=request.source_type,
            name=request.name,
            repository_url=request.repository_url,
            local_path=request.local_path,
            branch_name=request.branch_name,
            archon_source_id=request.archon_source_id,
            archon_project_id=request.archon_project_id,
            languages=request.languages,
            max_file_size_kb=request.max_file_size_kb,
            parse_timeout_seconds=request.parse_timeout_seconds,
            enable_cross_file_refs=request.enable_cross_file_refs,
        )

        # Start progress tracking
        await start_parsing_progress(
            parsing_id,
            {
                "name": request.name,
                "repository_url": request.repository_url,
                "local_path": request.local_path,
                "estimated_duration": "3-10 minutes",
            }
        )

        # Start background parsing task
        task = asyncio.create_task(
            _perform_repository_parsing(parsing_id, parse_request)
        )
        active_parsing_tasks[parsing_id] = task

        safe_logfire_info(
            f"Repository parsing started | parsing_id={parsing_id} | name={request.name}"
        )

        return {
            "success": True,
            "parsing_id": parsing_id,
            "message": "Repository parsing started",
            "estimated_duration": "3-10 minutes",
        }

    except Exception as e:
        safe_logfire_error(f"Failed to start repository parsing | error={str(e)}")
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.post("/query", response_model=Dict[str, Any])
async def query_graph(request: GraphQueryRequest):
    """
    Query the knowledge graph for nodes and relationships.
    
    Supports filtering by node types, relationship types, languages,
    and path-based queries between specific nodes.
    """
    try:
        safe_logfire_info(f"Executing graph query | repository_id={request.repository_id}")

        # Create graph query
        from uuid import UUID
        from ..services.knowledge_graph.models import NodeType, RelationshipType

        # Convert string types to enums
        node_types = None
        if request.node_types:
            node_types = [NodeType(nt) for nt in request.node_types]

        relationship_types = []
        if request.relationship_types:
            relationship_types = [RelationshipType(rt) for rt in request.relationship_types]

        query = GraphQuery(
            repository_id=UUID(request.repository_id),
            start_node_id=UUID(request.start_node_id) if request.start_node_id else None,
            end_node_id=UUID(request.end_node_id) if request.end_node_id else None,
            relationship_types=relationship_types,
            max_depth=request.max_depth,
            node_types=node_types,
            language_filter=request.language_filter,
            include_properties=request.include_properties,
        )

        # Execute query
        kg_service = KnowledgeGraphService(get_supabase_client())
        result = await kg_service.query_graph(query)

        safe_logfire_info(
            f"Graph query completed | repository_id={request.repository_id} | nodes={result.get('total_nodes', 0)} | relationships={result.get('total_relationships', 0)}"
        )

        return {
            "success": True,
            "data": result,
        }

    except Exception as e:
        safe_logfire_error(
            f"Graph query failed | error={str(e)} | repository_id={request.repository_id}"
        )
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.get("/statistics/{repository_id}")
async def get_graph_statistics(repository_id: str):
    """
    Get comprehensive statistics for a repository's knowledge graph.
    
    Returns node counts, relationship counts, language distribution,
    complexity metrics, and other analytical insights.
    """
    try:
        safe_logfire_info(f"Getting graph statistics | repository_id={repository_id}")

        from uuid import UUID

        kg_service = KnowledgeGraphService(get_supabase_client())
        stats = await kg_service.get_graph_statistics(UUID(repository_id))

        safe_logfire_info(
            f"Graph statistics retrieved | repository_id={repository_id} | total_nodes={stats.total_nodes} | total_relationships={stats.total_relationships}"
        )

        return {
            "success": True,
            "data": stats.dict(),
        }

    except Exception as e:
        safe_logfire_error(
            f"Failed to get graph statistics | error={str(e)} | repository_id={repository_id}"
        )
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.post("/analyze")
async def analyze_repository(request: AnalysisRequest):
    """
    Perform advanced analysis on a repository's knowledge graph.
    
    Supports multiple analysis types:
    - dependency_tree: Analyze dependencies and circular references
    - complexity_analysis: Find complex code patterns and hotspots
    - hotspots: Identify problematic code areas with high coupling
    - architecture_overview: Generate architectural insights and patterns
    """
    try:
        safe_logfire_info(
            f"Starting repository analysis | repository_id={request.repository_id} | analysis_type={request.analysis_type}"
        )

        from uuid import UUID
        from ..services.knowledge_graph.models import AnalysisType

        kg_service = KnowledgeGraphService(get_supabase_client())
        analysis = await kg_service.analyze_repository(
            UUID(request.repository_id),
            AnalysisType(request.analysis_type),
            request.parameters
        )

        safe_logfire_info(
            f"Repository analysis completed | repository_id={request.repository_id} | analysis_type={request.analysis_type} | execution_time_ms={analysis.execution_time_ms}"
        )

        return {
            "success": True,
            "data": {
                "analysis_id": str(analysis.id),
                "analysis_type": analysis.analysis_type.value,
                "results": analysis.results,
                "execution_time_ms": analysis.execution_time_ms,
                "created_at": analysis.created_at.isoformat(),
            },
        }

    except Exception as e:
        safe_logfire_error(
            f"Repository analysis failed | error={str(e)} | repository_id={request.repository_id} | analysis_type={request.analysis_type}"
        )
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.get("/repositories")
async def list_repositories(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    language: Optional[str] = None,
):
    """
    List all parsed repositories with optional filtering.
    
    Returns basic information about each repository including
    parsing status, language distribution, and statistics.
    """
    try:
        safe_logfire_info(f"Listing repositories | page={page} | per_page={per_page} | language={language}")

        supabase = get_supabase_client()
        
        # Build query
        query = supabase.from_("archon_kg_repositories").select(
            "id, name, repository_url, branch_name, primary_language, all_languages, "
            "total_files, parsed_files, parsing_duration_seconds, created_at, updated_at"
        )

        # Apply language filter if specified
        if language:
            query = query.contains("all_languages", [language])

        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)

        # Execute query
        result = query.execute()
        repositories = result.data if result.data else []

        # Get total count
        count_result = supabase.from_("archon_kg_repositories").select("id", count="exact").execute()
        total = count_result.count if count_result.count else 0

        safe_logfire_info(f"Listed {len(repositories)} repositories | total={total}")

        return {
            "success": True,
            "data": {
                "repositories": repositories,
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total": total,
                    "pages": (total + per_page - 1) // per_page,
                },
            },
        }

    except Exception as e:
        safe_logfire_error(f"Failed to list repositories | error={str(e)}")
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.get("/repositories/{repository_id}")
async def get_repository(repository_id: str):
    """
    Get detailed information about a specific repository.
    
    Returns repository metadata, parsing statistics, and basic graph metrics.
    """
    try:
        safe_logfire_info(f"Getting repository details | repository_id={repository_id}")

        supabase = get_supabase_client()
        
        # Get repository details
        repo_result = supabase.from_("archon_kg_repositories").select("*").eq(
            "id", repository_id
        ).execute()

        if not repo_result.data:
            raise HTTPException(status_code=404, detail={"error": "Repository not found"})

        repository = repo_result.data[0]

        # Get basic statistics
        from uuid import UUID
        kg_service = KnowledgeGraphService(get_supabase_client())
        stats = await kg_service.get_graph_statistics(UUID(repository_id))

        safe_logfire_info(f"Repository details retrieved | repository_id={repository_id}")

        return {
            "success": True,
            "data": {
                "repository": repository,
                "statistics": stats.dict(),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        safe_logfire_error(f"Failed to get repository | error={str(e)} | repository_id={repository_id}")
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.delete("/repositories/{repository_id}")
async def delete_repository(repository_id: str):
    """
    Delete a repository and all its associated knowledge graph data.
    
    This operation removes all nodes, relationships, and analysis data
    associated with the repository. Uses CASCADE constraints for clean deletion.
    """
    try:
        safe_logfire_info(f"Deleting repository | repository_id={repository_id}")

        supabase = get_supabase_client()
        
        # Check if repository exists
        repo_result = supabase.from_("archon_kg_repositories").select("id").eq(
            "id", repository_id
        ).execute()

        if not repo_result.data:
            raise HTTPException(status_code=404, detail={"error": "Repository not found"})

        # Delete the repository - CASCADE constraints will handle related data
        # The database schema has ON DELETE CASCADE for:
        # - archon_kg_nodes references archon_kg_repositories
        # - archon_kg_relationships references archon_kg_nodes  
        # - archon_kg_analysis references archon_kg_repositories
        result = supabase.from_("archon_kg_repositories").delete().eq("id", repository_id).execute()
        
        # Verify deletion was successful
        if not result.data:
            safe_logfire_error(f"Failed to delete repository - no data returned | repository_id={repository_id}")
            raise HTTPException(status_code=500, detail={"error": "Failed to delete repository"})

        safe_logfire_info(f"Repository deleted successfully | repository_id={repository_id}")

        return {
            "success": True,
            "message": f"Repository {repository_id} deleted successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        safe_logfire_error(f"Failed to delete repository | error={str(e)} | repository_id={repository_id}")
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.post("/parsing/{parsing_id}/cancel")
async def cancel_parsing(parsing_id: str):
    """
    Cancel an active repository parsing operation.
    
    Stops the parsing process and cleans up any partial results.
    """
    try:
        safe_logfire_info(f"Cancelling parsing | parsing_id={parsing_id}")

        # Cancel the parsing task
        if parsing_id in active_parsing_tasks:
            task = active_parsing_tasks[parsing_id]
            if not task.done():
                task.cancel()
                
                # Send cancellation event
                await cancel_parsing_progress(parsing_id)
                
                safe_logfire_info(f"Parsing cancelled successfully | parsing_id={parsing_id}")
                
                return {
                    "success": True,
                    "message": "Parsing cancelled successfully",
                }
            else:
                return {
                    "success": False,
                    "message": "Parsing task has already completed",
                }
        else:
            return {
                "success": False,
                "message": "No active parsing task found with the given ID",
            }

    except Exception as e:
        safe_logfire_error(f"Failed to cancel parsing | error={str(e)} | parsing_id={parsing_id}")
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.get("/languages")
async def get_supported_languages():
    """
    Get list of supported programming languages for parsing.
    
    Returns all languages supported by the Tree-sitter parser
    along with their file extensions and capabilities.
    """
    try:
        from ..services.knowledge_graph.parser import TreeSitterParser
        
        parser = TreeSitterParser()
        languages = parser.get_supported_languages()
        
        # Get detailed configuration for each language
        language_configs = []
        for lang in languages:
            config = parser.get_language_config(lang)
            if config:
                language_configs.append({
                    "language": config.language,
                    "file_extensions": config.file_extensions,
                    "supported_node_types": [nt.value for nt in config.supported_node_types],
                    "complexity_enabled": config.complexity_enabled,
                })

        return {
            "success": True,
            "data": {
                "languages": language_configs,
                "total_languages": len(language_configs),
            },
        }

    except Exception as e:
        safe_logfire_error(f"Failed to get supported languages | error={str(e)}")
        raise HTTPException(status_code=500, detail={"error": str(e)})


# Background parsing function
async def _perform_repository_parsing(parsing_id: str, parse_request: ParseRequest):
    """Perform repository parsing with progress tracking."""
    kg_service = None
    
    try:
        safe_logfire_info(f"📋 [DEBUG] Background task started | parsing_id={parsing_id}")
        
        # Add delay for WebSocket subscription
        await asyncio.sleep(1.0)
        safe_logfire_info(f"📋 [DEBUG] After sleep delay | parsing_id={parsing_id}")

        # Create progress callback
        async def progress_callback(progress: ParsingProgress):
            try:
                safe_logfire_info(f"📋 [DEBUG] Progress callback triggered | parsing_id={parsing_id}")
                progress_data = {
                    "kg_source_id": str(progress.kg_source_id) if progress.kg_source_id else None,
                    "status": progress.status.value,
                    "total_files": progress.total_files,
                    "processed_files": progress.processed_files,
                    "current_file": progress.current_file,
                    "nodes_created": progress.nodes_created,
                    "relationships_created": progress.relationships_created,
                    "errors": progress.errors[-5:] if progress.errors else [],  # Last 5 errors
                    "start_time": progress.start_time.isoformat() if progress.start_time else None,
                    "estimated_completion": progress.estimated_completion.isoformat() if progress.estimated_completion else None,
                }
                await update_parsing_progress(parsing_id, progress_data)
                safe_logfire_info(f"📋 [DEBUG] Progress update sent | parsing_id={parsing_id}")
            except Exception as callback_error:
                safe_logfire_error(f"📋 [DEBUG] Progress callback failed | parsing_id={parsing_id} | error={str(callback_error)}")

        safe_logfire_info(f"📋 [DEBUG] About to initialize KG service | parsing_id={parsing_id}")
        
        # Initialize service with detailed error handling
        try:
            safe_logfire_info(f"📋 [DEBUG] Creating Supabase client | parsing_id={parsing_id}")
            supabase_client = get_supabase_client()
            safe_logfire_info(f"📋 [DEBUG] Supabase client created | parsing_id={parsing_id}")
            
            safe_logfire_info(f"📋 [DEBUG] Creating KnowledgeGraphService | parsing_id={parsing_id}")
            kg_service = KnowledgeGraphService(supabase_client)
            safe_logfire_info(f"📋 [DEBUG] KnowledgeGraphService created successfully | parsing_id={parsing_id}")
            
        except Exception as init_error:
            import traceback
            traceback_str = traceback.format_exc()
            safe_logfire_error(f"📋 [DEBUG] KG service initialization failed | parsing_id={parsing_id} | error={str(init_error)} | traceback={traceback_str}")
            await error_parsing_progress(parsing_id, f"Service initialization failed: {str(init_error)}")
            return
        
        safe_logfire_info(f"📋 [DEBUG] KG service initialized, storing task | parsing_id={parsing_id}")
        
        # Store task for cancellation
        current_task = asyncio.current_task()
        if current_task:
            active_parsing_tasks[parsing_id] = current_task
            safe_logfire_info(f"📋 [DEBUG] Task stored for cancellation | parsing_id={parsing_id}")

        # Perform parsing with detailed logging
        safe_logfire_info(f"📋 [DEBUG] Starting repository parsing | parsing_id={parsing_id} | request_name={parse_request.name}")
        
        try:
            result = await kg_service.parse_repository(parse_request, progress_callback)
            safe_logfire_info(f"📋 [DEBUG] Repository parsing method completed | parsing_id={parsing_id} | success={result.success}")
        except Exception as parsing_error:
            import traceback
            traceback_str = traceback.format_exc()
            safe_logfire_error(f"📋 [DEBUG] Repository parsing method failed | parsing_id={parsing_id} | error={str(parsing_error)} | traceback={traceback_str}")
            await error_parsing_progress(parsing_id, f"Repository parsing failed: {str(parsing_error)}")
            return

        if result.success:
            safe_logfire_info(f"📋 [DEBUG] Parsing successful, sending completion | parsing_id={parsing_id}")
            
            # Get REAL statistics from the database
            real_statistics = None
            if result.kg_repository_id:
                try:
                    from uuid import UUID
                    kg_repository_uuid = UUID(result.kg_repository_id)
                    real_stats = await kg_service.get_graph_statistics(kg_repository_uuid)
                    real_statistics = {
                        "total_files": result.statistics.get("total_files", 0) if result.statistics else 0,
                        "parsed_files": result.statistics.get("parsed_files", 0) if result.statistics else 0,
                        "total_nodes": real_stats.total_nodes,
                        "total_relationships": real_stats.total_relationships,
                        "parsing_duration_seconds": result.statistics.get("parsing_duration_seconds", 0) if result.statistics else 0,
                        "languages_detected": result.statistics.get("languages_detected", []) if result.statistics else [],
                        "nodes_by_type": real_stats.nodes_by_type,
                        "relationships_by_type": real_stats.relationships_by_type,
                        "languages": real_stats.languages,
                    }
                    safe_logfire_info(f"📋 [DEBUG] Real statistics retrieved | total_nodes={real_stats.total_nodes} | total_relationships={real_stats.total_relationships}")
                except Exception as stats_error:
                    safe_logfire_error(f"📋 [DEBUG] Failed to get real statistics | error={str(stats_error)}")
                    real_statistics = result.statistics
            
            await complete_parsing_progress(
                parsing_id,
                {
                    "kg_source_id": str(result.kg_source_id) if result.kg_source_id else None,
                    "kg_repository_id": str(result.kg_repository_id) if result.kg_repository_id else None,
                    "statistics": real_statistics or result.statistics,
                    "nodes_created": real_statistics.get("total_nodes", 0) if real_statistics else 0,
                    "relationships_created": real_statistics.get("total_relationships", 0) if real_statistics else 0,
                }
            )
            safe_logfire_info(f"📋 [DEBUG] Parsing completed successfully | parsing_id={parsing_id}")
        else:
            error_msg = result.error or result.message
            safe_logfire_error(f"📋 [DEBUG] Parsing failed with result error | parsing_id={parsing_id} | error={error_msg}")
            await error_parsing_progress(parsing_id, error_msg)

    except asyncio.CancelledError:
        safe_logfire_info(f"📋 [DEBUG] Repository parsing cancelled | parsing_id={parsing_id}")
        await error_parsing_progress(parsing_id, "Parsing was cancelled by user")
        raise
    except Exception as e:
        import traceback
        error_message = f"Repository parsing failed: {str(e)}"
        traceback_str = traceback.format_exc()
        safe_logfire_error(f"📋 [DEBUG] Repository parsing error | parsing_id={parsing_id} | error={error_message} | traceback={traceback_str}")
        
        # Always try to send error to frontend
        try:
            await error_parsing_progress(parsing_id, error_message)
            safe_logfire_info(f"📋 [DEBUG] Error sent to frontend | parsing_id={parsing_id}")
        except Exception as error_send_error:
            safe_logfire_error(f"📋 [DEBUG] Failed to send error to frontend | parsing_id={parsing_id} | error={str(error_send_error)}")
            
    finally:
        # Cleanup task
        if parsing_id in active_parsing_tasks:
            del active_parsing_tasks[parsing_id]
            safe_logfire_info(f"📋 [DEBUG] Cleaned up parsing task | parsing_id={parsing_id}")


# Socket.IO Event Handlers are registered in socketio_handlers.py


# Health check for Socket.IO functionality
@router.get("/socket-test/{parsing_id}")
async def test_socket_progress(parsing_id: str):
    """Test endpoint to verify Socket.IO Knowledge Graph progress is working."""
    try:
        # Send a test progress update
        test_data = {
            "parsingId": parsing_id,
            "status": "testing",
            "message": "Test progress update from Knowledge Graph API",
            "total_files": 100,
            "processed_files": 50,
            "nodes_created": 250,
            "relationships_created": 150,
        }

        await update_parsing_progress(parsing_id, test_data)

        return {
            "success": True,
            "message": f"Test progress sent to KG parsing room {parsing_id}",
            "data": test_data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})

@router.get("/debug-service")
async def debug_service():
    """Debug endpoint to test KG service initialization."""
    try:
        # Test service initialization
        kg_service = KnowledgeGraphService(get_supabase_client())
        
        # Test parser initialization
        languages = kg_service.parser.get_supported_languages()
        
        # Test a simple parse request
        test_request = ParseRequest(
            source_type="project_repository",
            name="Debug Test",
            repository_url="https://github.com/user/test",
            branch_name="main"
        )
        
        return {
            "success": True,
            "message": "KG service initialized successfully",
            "supported_languages": len(languages),
            "test_request_valid": bool(test_request),
            "service_initialized": bool(kg_service),
        }
    except Exception as e:
        safe_logfire_error(f"KG service debug failed | error={str(e)}")
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
        }

@router.get("/simple-test")
async def simple_test():
    """Ultra simple test endpoint."""
    return {"status": "ok", "message": "KG API is responsive"}
