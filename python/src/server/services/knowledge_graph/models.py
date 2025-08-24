"""
Pydantic models for Knowledge Graph functionality.

These models define the data structures for code parsing, graph construction,
and repository analysis following Archon's database schema and patterns.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    """Knowledge Graph source types."""
    CRAWLED_CONTENT = "crawled_content"
    PROJECT_REPOSITORY = "project_repository"
    UPLOADED_FILE = "uploaded_file"


class ParsingStatus(str, Enum):
    """Repository parsing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DISABLED = "disabled"


class NodeType(str, Enum):
    """Code entity types."""
    FILE = "file"
    CLASS = "class"
    FUNCTION = "function"
    METHOD = "method"
    VARIABLE = "variable"
    IMPORT = "import"
    INTERFACE = "interface"
    ENUM = "enum"
    MODULE = "module"
    NAMESPACE = "namespace"


class RelationshipType(str, Enum):
    """Code relationship types."""
    CALLS = "calls"
    INHERITS = "inherits"
    IMPORTS = "imports"
    USES = "uses"
    DEFINES = "defines"
    CONTAINS = "contains"
    DEPENDS_ON = "depends_on"
    IMPLEMENTS = "implements"
    EXTENDS = "extends"


class AnalysisType(str, Enum):
    """Graph analysis types."""
    DEPENDENCY_TREE = "dependency_tree"
    COMPLEXITY_ANALYSIS = "complexity_analysis"
    HOTSPOTS = "hotspots"
    ARCHITECTURE_OVERVIEW = "architecture_overview"


# Base models matching database schema

class KGSource(BaseModel):
    """Knowledge Graph source linking to existing Archon content."""
    id: Optional[UUID] = None
    source_type: SourceType
    archon_source_id: Optional[str] = None
    archon_project_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    repository_url: Optional[str] = None
    branch_name: str = "main"
    local_path: Optional[str] = None
    parsing_status: ParsingStatus = ParsingStatus.PENDING
    parsing_started_at: Optional[datetime] = None
    parsing_completed_at: Optional[datetime] = None
    parsing_error: Optional[str] = None
    total_files_found: int = 0
    total_files_parsed: int = 0
    total_nodes_created: int = 0
    total_relationships_created: int = 0
    detected_languages: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class KGRepository(BaseModel):
    """Parsed repository metadata and statistics."""
    id: Optional[UUID] = None
    kg_source_id: UUID
    name: str
    repository_url: Optional[str] = None
    branch_name: str = "main"
    commit_hash: Optional[str] = None
    primary_language: Optional[str] = None
    all_languages: List[str] = Field(default_factory=list)
    directory_structure: Dict[str, Any] = Field(default_factory=dict)
    total_files: int = 0
    parsed_files: int = 0
    skipped_files: int = 0
    error_files: int = 0
    parsing_duration_seconds: Optional[int] = None
    avg_parse_time_per_file_ms: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class KGNode(BaseModel):
    """Individual code entities extracted from repositories."""
    id: Optional[UUID] = None
    kg_repository_id: UUID
    node_type: NodeType
    name: str
    fully_qualified_name: Optional[str] = None
    file_path: str
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    column_start: Optional[int] = None
    column_end: Optional[int] = None
    language: str
    properties: Dict[str, Any] = Field(default_factory=dict)
    source_code: Optional[str] = None
    docstring: Optional[str] = None
    complexity_score: Optional[int] = None
    is_public: bool = True
    is_exported: bool = False
    created_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class KGRelationship(BaseModel):
    """Relationships between code entities."""
    id: Optional[UUID] = None
    source_node_id: UUID
    target_node_id: UUID
    relationship_type: RelationshipType
    confidence_score: float = 1.0
    call_count: Optional[int] = None
    is_direct: bool = True
    context_info: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class KGAnalysis(BaseModel):
    """Cached analysis results for performance optimization."""
    id: Optional[UUID] = None
    kg_repository_id: UUID
    analysis_type: AnalysisType
    parameters: Dict[str, Any] = Field(default_factory=dict)
    results: Dict[str, Any]
    execution_time_ms: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


# Request/Response models for API

class ParseRequest(BaseModel):
    """Request to parse a repository."""
    source_type: SourceType
    name: str
    repository_url: Optional[str] = None
    local_path: Optional[str] = None
    branch_name: str = "main"
    archon_source_id: Optional[str] = None
    archon_project_id: Optional[UUID] = None
    languages: Optional[List[str]] = None
    max_file_size_kb: int = 500
    parse_timeout_seconds: int = 30
    enable_cross_file_refs: bool = True

    class Config:
        schema_extra = {
            "example": {
                "source_type": "project_repository",
                "name": "Sample Repository",
                "repository_url": "https://github.com/user/repo",
                "branch_name": "main",
                "languages": ["python", "javascript"],
                "max_file_size_kb": 500,
                "parse_timeout_seconds": 30,
                "enable_cross_file_refs": True
            }
        }


class ParseResult(BaseModel):
    """Result of repository parsing operation."""
    success: bool
    kg_source_id: Optional[str] = None
    kg_repository_id: Optional[str] = None
    message: str
    statistics: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class GraphQuery(BaseModel):
    """Query for graph traversal operations."""
    repository_id: UUID
    start_node_id: Optional[UUID] = None
    end_node_id: Optional[UUID] = None
    relationship_types: List[RelationshipType] = Field(default_factory=list)
    max_depth: int = 3
    node_types: Optional[List[NodeType]] = None
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


class GraphStats(BaseModel):
    """Repository graph statistics."""
    total_nodes: int
    total_relationships: int
    nodes_by_type: Dict[str, int]
    relationships_by_type: Dict[str, int]
    languages: Dict[str, int]
    complexity_stats: Dict[str, float]


class NodeDependencies(BaseModel):
    """Node dependency information."""
    node_id: UUID
    name: str
    node_type: NodeType
    file_path: str
    dependencies: List[Dict[str, Any]]
    dependents: List[Dict[str, Any]]


class GraphPath(BaseModel):
    """Path between two nodes in the graph."""
    start_node_id: UUID
    end_node_id: UUID
    path: List[Dict[str, Any]]
    total_steps: int


class FileParseResult(BaseModel):
    """Result of parsing a single file."""
    file_path: str
    language: str
    success: bool
    nodes_extracted: int
    relationships_extracted: int
    parse_time_ms: int
    error: Optional[str] = None


class LanguageConfig(BaseModel):
    """Configuration for language-specific parsing."""
    language: str
    file_extensions: List[str]
    tree_sitter_grammar: str
    supported_node_types: List[NodeType]
    complexity_enabled: bool = True


class ParsingProgress(BaseModel):
    """Real-time parsing progress information."""
    kg_source_id: str
    status: ParsingStatus
    total_files: int
    processed_files: int
    current_file: Optional[str] = None
    nodes_created: int
    relationships_created: int
    errors: List[str] = Field(default_factory=list)
    start_time: datetime
    estimated_completion: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }