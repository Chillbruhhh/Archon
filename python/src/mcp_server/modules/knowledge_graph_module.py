"""
Knowledge Graph Module for Archon MCP Server

This module provides AI assistant integration for Knowledge Graph operations including:
- Repository parsing and code analysis
- Graph querying and traversal
- Advanced analytics and insights
- Real-time parsing progress tracking

🧠 Knowledge Graph Features:
- Universal code parsing for 20+ programming languages
- Relationship detection across files and modules
- Advanced analytics (complexity, hotspots, architecture)
- Interactive graph visualization data

🔧 MCP Tools Available:
- kg_parse_repository: Parse repository and build knowledge graph
- kg_query_graph: Query graph for nodes and relationships
- kg_get_statistics: Get comprehensive graph statistics
- kg_analyze_repository: Perform advanced analysis
- kg_list_repositories: List all parsed repositories
- kg_get_languages: Get supported programming languages

⚡ Real-time Features:
- WebSocket progress tracking for parsing operations
- Cancellation support for long-running tasks
- Detailed error reporting and recovery

This module enables AI assistants to leverage knowledge graphs for:
- Code understanding and navigation
- Architecture analysis and recommendations
- Dependency tracking and circular reference detection
- Code quality assessment and improvement suggestions
"""

import json
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx
from mcp.server.fastmcp import Context, FastMCP

from src.server.config.service_discovery import get_api_url

logger = logging.getLogger(__name__)


def register_knowledge_graph_tools(mcp: FastMCP):
    """Register Knowledge Graph tools with the MCP server."""

    @mcp.tool()
    async def kg_parse_repository(
        ctx: Context,
        name: str,
        repository_url: str = None,
        local_path: str = None,
        branch_name: str = "main",
        archon_source_id: str = None,
        archon_project_id: str = None,
        languages: List[str] = None,
        max_file_size_kb: int = 500,
        enable_cross_file_refs: bool = True,
    ) -> str:
        """
        Parse a repository and build its knowledge graph.

        This tool starts repository parsing with Tree-sitter and builds a comprehensive
        knowledge graph of code entities and relationships. Returns a parsing ID for
        tracking progress via WebSocket events.

        Args:
            name: Descriptive name for the repository
            repository_url: Optional URL to remote repository
            local_path: Optional path to local repository
            branch_name: Git branch to parse (default: main)
            archon_source_id: Optional link to existing Archon source
            archon_project_id: Optional link to existing Archon project
            languages: Optional list of languages to parse (e.g., ["python", "javascript"])
            max_file_size_kb: Maximum file size to parse in KB (default: 500)
            enable_cross_file_refs: Enable cross-file relationship detection (default: true)

        Returns:
            JSON string with parsing status and tracking information

        Example:
            kg_parse_repository(
                name="My Project",
                repository_url="https://github.com/user/repo",
                languages=["python", "typescript"],
                enable_cross_file_refs=True
            )
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            request_data = {
                "name": name,
                "repository_url": repository_url,
                "local_path": local_path,
                "branch_name": branch_name,
                "archon_source_id": archon_source_id,
                "archon_project_id": archon_project_id,
                "languages": languages,
                "max_file_size_kb": max_file_size_kb,
                "enable_cross_file_refs": enable_cross_file_refs,
            }

            # Remove None values
            request_data = {k: v for k, v in request_data.items() if v is not None}

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    urljoin(api_url, "/api/knowledge-graph/parse"),
                    json=request_data
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error parsing repository: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_query_graph(
        ctx: Context,
        repository_id: str,
        start_node_id: str = None,
        end_node_id: str = None,
        relationship_types: List[str] = None,
        max_depth: int = 3,
        node_types: List[str] = None,
        language_filter: str = None,
        include_properties: bool = False,
    ) -> str:
        """
        Query the knowledge graph for nodes and relationships.

        Performs advanced queries on the knowledge graph including filtering by
        node types, relationship types, languages, and path-based searches.

        Args:
            repository_id: UUID of the repository to query
            start_node_id: Optional starting node for path queries
            end_node_id: Optional ending node for path queries
            relationship_types: List of relationship types to include (e.g., ["calls", "imports"])
            max_depth: Maximum traversal depth for graph queries (default: 3)
            node_types: List of node types to include (e.g., ["class", "function"])
            language_filter: Filter by programming language (e.g., "python")
            include_properties: Include detailed node properties in results

        Returns:
            JSON string with matching nodes and relationships

        Example:
            kg_query_graph(
                repository_id="550e8400-e29b-41d4-a716-446655440000",
                relationship_types=["calls", "imports"],
                node_types=["class", "function"],
                language_filter="python",
                max_depth=2
            )
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            request_data = {
                "repository_id": repository_id,
                "start_node_id": start_node_id,
                "end_node_id": end_node_id,
                "relationship_types": relationship_types or [],
                "max_depth": max_depth,
                "node_types": node_types,
                "language_filter": language_filter,
                "include_properties": include_properties,
            }

            # Remove None values
            request_data = {k: v for k, v in request_data.items() if v is not None}

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    urljoin(api_url, "/api/knowledge-graph/query"),
                    json=request_data
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error querying graph: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_get_statistics(ctx: Context, repository_id: str) -> str:
        """
        Get comprehensive statistics for a repository's knowledge graph.

        Returns detailed metrics including node counts, relationship counts,
        language distribution, complexity metrics, and other analytical insights.

        Args:
            repository_id: UUID of the repository

        Returns:
            JSON string with comprehensive graph statistics

        Example:
            kg_get_statistics("550e8400-e29b-41d4-a716-446655440000")
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    urljoin(api_url, f"/api/knowledge-graph/statistics/{repository_id}")
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_analyze_repository(
        ctx: Context,
        repository_id: str,
        analysis_type: str,
        parameters: Dict[str, Any] = None,
    ) -> str:
        """
        Perform advanced analysis on a repository's knowledge graph.

        Supports multiple analysis types for gaining insights into code architecture,
        complexity patterns, and potential issues.

        Args:
            repository_id: UUID of the repository
            analysis_type: Type of analysis to perform:
                - "dependency_tree": Analyze dependencies and circular references
                - "complexity_analysis": Find complex code patterns and hotspots
                - "hotspots": Identify problematic code areas with high coupling
                - "architecture_overview": Generate architectural insights and patterns
            parameters: Optional analysis parameters (dict)

        Returns:
            JSON string with analysis results and insights

        Example:
            kg_analyze_repository(
                repository_id="550e8400-e29b-41d4-a716-446655440000",
                analysis_type="complexity_analysis",
                parameters={"threshold": 5}
            )
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(60.0, connect=5.0)  # Longer timeout for analysis

            request_data = {
                "repository_id": repository_id,
                "analysis_type": analysis_type,
                "parameters": parameters or {},
            }

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    urljoin(api_url, "/api/knowledge-graph/analyze"),
                    json=request_data
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error analyzing repository: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_list_repositories(
        ctx: Context,
        page: int = 1,
        per_page: int = 20,
        language: str = None,
    ) -> str:
        """
        List all parsed repositories with optional filtering.

        Returns basic information about each repository including parsing status,
        language distribution, and statistics.

        Args:
            page: Page number for pagination (default: 1)
            per_page: Items per page (default: 20, max: 100)
            language: Optional language filter (e.g., "python")

        Returns:
            JSON string with repository list and pagination info

        Example:
            kg_list_repositories(page=1, per_page=10, language="python")
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            params = {"page": page, "per_page": min(per_page, 100)}
            if language:
                params["language"] = language

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    urljoin(api_url, "/api/knowledge-graph/repositories"),
                    params=params
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error listing repositories: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_get_repository(ctx: Context, repository_id: str) -> str:
        """
        Get detailed information about a specific repository.

        Returns repository metadata, parsing statistics, and basic graph metrics.

        Args:
            repository_id: UUID of the repository

        Returns:
            JSON string with detailed repository information

        Example:
            kg_get_repository("550e8400-e29b-41d4-a716-446655440000")
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    urljoin(api_url, f"/api/knowledge-graph/repositories/{repository_id}")
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                elif response.status_code == 404:
                    return json.dumps(
                        {
                            "success": False,
                            "error": "Repository not found",
                        },
                        indent=2,
                    )
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error getting repository: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_delete_repository(ctx: Context, repository_id: str) -> str:
        """
        Delete a repository and all its associated knowledge graph data.

        This operation removes all nodes, relationships, and analysis data
        associated with the repository. Use with caution as this action is irreversible.

        Args:
            repository_id: UUID of the repository to delete

        Returns:
            JSON string with deletion status

        Example:
            kg_delete_repository("550e8400-e29b-41d4-a716-446655440000")
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.delete(
                    urljoin(api_url, f"/api/knowledge-graph/repositories/{repository_id}")
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                elif response.status_code == 404:
                    return json.dumps(
                        {
                            "success": False,
                            "error": "Repository not found",
                        },
                        indent=2,
                    )
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error deleting repository: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_cancel_parsing(ctx: Context, parsing_id: str) -> str:
        """
        Cancel an active repository parsing operation.

        Stops the parsing process and cleans up any partial results.

        Args:
            parsing_id: UUID of the parsing operation to cancel

        Returns:
            JSON string with cancellation status

        Example:
            kg_cancel_parsing("550e8400-e29b-41d4-a716-446655440000")
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    urljoin(api_url, f"/api/knowledge-graph/parsing/{parsing_id}/cancel")
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error cancelling parsing: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_get_languages(ctx: Context) -> str:
        """
        Get list of supported programming languages for parsing.

        Returns all languages supported by the Tree-sitter parser along with
        their file extensions and parsing capabilities.

        Returns:
            JSON string with supported languages and their configurations

        Example:
            kg_get_languages()
        """
        try:
            api_url = get_api_url()
            timeout = httpx.Timeout(30.0, connect=5.0)

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    urljoin(api_url, "/api/knowledge-graph/languages")
                )

                if response.status_code == 200:
                    result = response.json()
                    return json.dumps(result, indent=2)
                else:
                    error_detail = response.text
                    return json.dumps(
                        {
                            "success": False,
                            "error": f"HTTP {response.status_code}: {error_detail}",
                        },
                        indent=2,
                    )

        except Exception as e:
            logger.error(f"Error getting languages: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    @mcp.tool()
    async def kg_find_code_patterns(
        ctx: Context,
        repository_id: str,
        pattern_type: str,
        language: str = None,
        complexity_threshold: int = 5,
    ) -> str:
        """
        Find specific code patterns and anti-patterns in the repository.

        Uses the knowledge graph to identify common patterns, anti-patterns,
        and architectural insights.

        Args:
            repository_id: UUID of the repository
            pattern_type: Type of pattern to find:
                - "circular_dependencies": Find circular dependency chains
                - "god_classes": Find overly complex classes with too many responsibilities
                - "long_methods": Find methods with high complexity
                - "tight_coupling": Find highly coupled components
                - "dead_code": Find potentially unused code
            language: Optional language filter
            complexity_threshold: Minimum complexity score to consider (default: 5)

        Returns:
            JSON string with found patterns and recommendations

        Example:
            kg_find_code_patterns(
                repository_id="550e8400-e29b-41d4-a716-446655440000",
                pattern_type="circular_dependencies",
                language="python"
            )
        """
        try:
            # Use the analyze endpoint with specific parameters for pattern detection
            analysis_type = "hotspots"  # Default analysis type
            parameters = {
                "pattern_type": pattern_type,
                "complexity_threshold": complexity_threshold,
            }

            if language:
                parameters["language"] = language

            # Call the analyze endpoint
            result = await kg_analyze_repository(ctx, repository_id, analysis_type, parameters)
            return result

        except Exception as e:
            logger.error(f"Error finding code patterns: {e}")
            return json.dumps({"success": False, "error": str(e)}, indent=2)

    # Log successful registration
    logger.info("✓ Knowledge Graph tools registered (HTTP-based version)")


def register_kg_tools(mcp: FastMCP):
    """Alias for register_knowledge_graph_tools for backwards compatibility."""
    register_knowledge_graph_tools(mcp)