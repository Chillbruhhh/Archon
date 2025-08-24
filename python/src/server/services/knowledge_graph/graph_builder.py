"""
Graph builder for Knowledge Graph functionality.

This module constructs relationships between code entities, performs cross-file
analysis, and builds the complete knowledge graph following Archon's patterns.
"""

import asyncio
import re
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from uuid import UUID, uuid4

from .models import (
    KGNode,
    KGRelationship,
    NodeType,
    RelationshipType,
)


class GraphBuilder:
    """
    Constructs relationships between code entities and builds the knowledge graph.
    
    Performs cross-file analysis, dependency detection, and relationship inference
    following Archon's service patterns for optimal performance and accuracy.
    """

    def __init__(self):
        """Initialize the graph builder with relationship detection patterns."""
        self.relationship_patterns = self._initialize_relationship_patterns()
        self.cross_file_cache: Dict[str, Set[str]] = {}

    def _initialize_relationship_patterns(self) -> Dict[str, Dict[str, List[str]]]:
        """Initialize patterns for detecting relationships in different languages."""
        return {
            "python": {
                "calls": [
                    r"(\w+)\s*\(",  # function_name(
                    r"\.(\w+)\s*\(",  # .method_name(
                    r"(\w+)\.(\w+)\s*\(",  # object.method(
                ],
                "inherits": [
                    r"class\s+\w+\s*\(\s*(\w+)",  # class Child(Parent)
                    r"class\s+\w+\s*\(\s*(\w+(?:\.\w+)*)",  # class Child(module.Parent)
                ],
                "imports": [
                    r"from\s+(\w+(?:\.\w+)*)\s+import",  # from module import
                    r"import\s+(\w+(?:\.\w+)*)",  # import module
                ],
                "uses": [
                    r"(\w+)\s*=",  # variable assignment
                    r"(\w+)\s*\[",  # array/dict access
                    r"(\w+)\s*\.",  # attribute access
                ],
            },
            "javascript": {
                "calls": [
                    r"(\w+)\s*\(",  # function_name(
                    r"\.(\w+)\s*\(",  # .method_name(
                    r"(\w+)\.(\w+)\s*\(",  # object.method(
                ],
                "inherits": [
                    r"class\s+\w+\s+extends\s+(\w+)",  # class Child extends Parent
                ],
                "imports": [
                    r"import\s+.*from\s+['\"]([^'\"]+)['\"]",  # import from 'module'
                    r"require\s*\(\s*['\"]([^'\"]+)['\"]",  # require('module')
                ],
                "uses": [
                    r"(\w+)\s*=",  # variable assignment
                    r"(\w+)\s*\[",  # array access
                    r"(\w+)\s*\.",  # property access
                ],
            },
            "typescript": {
                "calls": [
                    r"(\w+)\s*\(",  # function_name(
                    r"\.(\w+)\s*\(",  # .method_name(
                    r"(\w+)\.(\w+)\s*\(",  # object.method(
                ],
                "inherits": [
                    r"class\s+\w+\s+extends\s+(\w+)",  # class Child extends Parent
                    r"interface\s+\w+\s+extends\s+(\w+)",  # interface Child extends Parent
                ],
                "implements": [
                    r"class\s+\w+\s+implements\s+(\w+)",  # class Impl implements Interface
                ],
                "imports": [
                    r"import\s+.*from\s+['\"]([^'\"]+)['\"]",  # import from 'module'
                    r"import\s+['\"]([^'\"]+)['\"]",  # import 'module'
                ],
                "uses": [
                    r"(\w+)\s*:",  # type annotations
                    r"(\w+)\s*=",  # variable assignment
                    r"(\w+)\s*\[",  # array access
                    r"(\w+)\s*\.",  # property access
                ],
            },
            "java": {
                "calls": [
                    r"(\w+)\s*\(",  # method_name(
                    r"\.(\w+)\s*\(",  # .method_name(
                    r"(\w+)\.(\w+)\s*\(",  # object.method(
                ],
                "inherits": [
                    r"class\s+\w+\s+extends\s+(\w+)",  # class Child extends Parent
                ],
                "implements": [
                    r"class\s+\w+\s+implements\s+(\w+)",  # class Impl implements Interface
                ],
                "imports": [
                    r"import\s+([^;]+);",  # import package.Class;
                ],
                "uses": [
                    r"(\w+)\s+\w+\s*=",  # Type variable =
                    r"(\w+)\s*\[",  # array access
                    r"(\w+)\s*\.",  # field access
                ],
            },
            "go": {
                "calls": [
                    r"(\w+)\s*\(",  # function_name(
                    r"\.(\w+)\s*\(",  # .method_name(
                    r"(\w+)\.(\w+)\s*\(",  # package.function(
                ],
                "imports": [
                    r"import\s+[\"']([^\"']+)[\"']",  # import "package"
                    r"import\s+\w+\s+[\"']([^\"']+)[\"']",  # import alias "package"
                ],
                "uses": [
                    r"(\w+)\s*:=",  # short variable declaration
                    r"var\s+\w+\s+(\w+)",  # var name Type
                    r"(\w+)\s*\[",  # slice/map access
                    r"(\w+)\s*\.",  # field access
                ],
            },
            "rust": {
                "calls": [
                    r"(\w+)\s*\(",  # function_name(
                    r"\.(\w+)\s*\(",  # .method_name(
                    r"(\w+)::(\w+)\s*\(",  # module::function(
                ],
                "uses": [
                    r"use\s+([^;]+);",  # use module::item;
                    r"(\w+)\s*::",  # module::
                    r"let\s+\w+:\s*(\w+)",  # let var: Type
                    r"(\w+)\s*\[",  # array access
                    r"(\w+)\s*\.",  # field access
                ],
            },
            "csharp": {
                "calls": [
                    r"(\w+)\s*\(",  # method_name(
                    r"\.(\w+)\s*\(",  # .method_name(
                    r"(\w+)\.(\w+)\s*\(",  # object.method(
                ],
                "inherits": [
                    r"class\s+\w+\s*:\s*(\w+)",  # class Child : Parent
                ],
                "implements": [
                    r"class\s+\w+\s*:\s*\w+,\s*(\w+)",  # class Impl : Base, Interface
                ],
                "imports": [
                    r"using\s+([^;]+);",  # using namespace;
                ],
                "uses": [
                    r"(\w+)\s+\w+\s*=",  # Type variable =
                    r"(\w+)\s*\[",  # array access
                    r"(\w+)\s*\.",  # property access
                ],
            },
        }

    async def build_relationships(
        self,
        nodes: List[KGNode],
        file_contents: Dict[str, str],
        progress_callback: Optional[Callable[[str, int], None]] = None,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> List[KGRelationship]:
        """
        Build relationships between code entities from parsed nodes.
        
        Args:
            nodes: List of extracted code nodes
            file_contents: Dictionary mapping file paths to their content
            progress_callback: Optional callback for progress updates
            cancellation_check: Optional callback to check for cancellation
            
        Returns:
            List of detected relationships
        """
        relationships = []
        
        # Group nodes by file and type for efficient processing
        nodes_by_file = defaultdict(list)
        nodes_by_name = {}
        nodes_by_type = defaultdict(list)
        
        for node in nodes:
            nodes_by_file[node.file_path].append(node)
            nodes_by_name[node.name] = node
            nodes_by_type[node.node_type].append(node)

        total_files = len(nodes_by_file)
        processed_files = 0

        if progress_callback:
            progress_callback("Building relationships...", 0)

        # Process each file for intra-file relationships
        for file_path, file_nodes in nodes_by_file.items():
            if cancellation_check:
                cancellation_check()

            content = file_contents.get(file_path, "")
            if not content:
                continue

            # Detect language from first non-file node
            language = None
            for node in file_nodes:
                if node.node_type != NodeType.FILE:
                    language = node.language
                    break
            
            if not language:
                continue

            # Build intra-file relationships
            file_relationships = await self._build_intra_file_relationships(
                file_nodes, content, language, cancellation_check
            )
            relationships.extend(file_relationships)

            processed_files += 1
            if progress_callback:
                progress = int((processed_files / total_files) * 50)  # 50% for intra-file
                progress_callback(f"Processing file {processed_files}/{total_files}", progress)

        # Build cross-file relationships
        if progress_callback:
            progress_callback("Building cross-file relationships...", 50)

        cross_file_relationships = await self._build_cross_file_relationships(
            nodes, file_contents, progress_callback, cancellation_check
        )
        relationships.extend(cross_file_relationships)

        # Build containment relationships
        if progress_callback:
            progress_callback("Building containment relationships...", 80)

        containment_relationships = await self._build_containment_relationships(
            nodes, cancellation_check
        )
        relationships.extend(containment_relationships)

        if progress_callback:
            progress_callback("Relationship building completed", 100)

        return relationships

    async def _build_intra_file_relationships(
        self,
        file_nodes: List[KGNode],
        content: str,
        language: str,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> List[KGRelationship]:
        """Build relationships within a single file."""
        relationships = []
        patterns = self.relationship_patterns.get(language, {})

        # Create lookup for nodes by name
        nodes_by_name = {node.name: node for node in file_nodes}
        
        # Find function/method calls
        if "calls" in patterns:
            for pattern in patterns["calls"]:
                for match in re.finditer(pattern, content):
                    if cancellation_check:
                        cancellation_check()

                    called_name = match.group(1) if match.lastindex >= 1 else match.group(0)
                    
                    # Find caller and callee nodes
                    line_num = content[:match.start()].count('\n') + 1
                    caller = self._find_node_at_line(file_nodes, line_num)
                    callee = nodes_by_name.get(called_name)
                    
                    if caller and callee and caller.id != callee.id:
                        relationship = KGRelationship(
                            id=uuid4(),
                            source_node_id=caller.id,
                            target_node_id=callee.id,
                            relationship_type=RelationshipType.CALLS,
                            confidence_score=0.8,
                            context_info={"line": line_num, "pattern": pattern},
                        )
                        relationships.append(relationship)

        # Find inheritance relationships
        if "inherits" in patterns:
            for pattern in patterns["inherits"]:
                for match in re.finditer(pattern, content):
                    if cancellation_check:
                        cancellation_check()

                    parent_name = match.group(1)
                    line_num = content[:match.start()].count('\n') + 1
                    
                    child = self._find_node_at_line(file_nodes, line_num)
                    parent = nodes_by_name.get(parent_name)
                    
                    if child and parent and child.node_type == NodeType.CLASS:
                        relationship = KGRelationship(
                            id=uuid4(),
                            source_node_id=child.id,
                            target_node_id=parent.id,
                            relationship_type=RelationshipType.INHERITS,
                            confidence_score=0.9,
                            context_info={"line": line_num, "pattern": pattern},
                        )
                        relationships.append(relationship)

        # Find implementation relationships
        if "implements" in patterns:
            for pattern in patterns["implements"]:
                for match in re.finditer(pattern, content):
                    if cancellation_check:
                        cancellation_check()

                    interface_name = match.group(1)
                    line_num = content[:match.start()].count('\n') + 1
                    
                    implementer = self._find_node_at_line(file_nodes, line_num)
                    interface = nodes_by_name.get(interface_name)
                    
                    if implementer and interface:
                        relationship = KGRelationship(
                            id=uuid4(),
                            source_node_id=implementer.id,
                            target_node_id=interface.id,
                            relationship_type=RelationshipType.IMPLEMENTS,
                            confidence_score=0.9,
                            context_info={"line": line_num, "pattern": pattern},
                        )
                        relationships.append(relationship)

        return relationships

    async def _build_cross_file_relationships(
        self,
        all_nodes: List[KGNode],
        file_contents: Dict[str, str],
        progress_callback: Optional[Callable[[str, int], None]] = None,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> List[KGRelationship]:
        """Build relationships across different files."""
        relationships = []
        
        # Create global node lookup
        nodes_by_name = {}
        nodes_by_fqn = {}
        
        for node in all_nodes:
            nodes_by_name[node.name] = node
            if node.fully_qualified_name:
                nodes_by_fqn[node.fully_qualified_name] = node

        # Process import relationships
        import_nodes = [node for node in all_nodes if node.node_type == NodeType.IMPORT]
        
        for i, import_node in enumerate(import_nodes):
            if cancellation_check:
                cancellation_check()

            # Find the imported module/file
            import_name = import_node.name
            
            # Look for corresponding file or module
            for node in all_nodes:
                if (node.node_type in [NodeType.FILE, NodeType.MODULE] and
                    (node.name == import_name or import_name in node.file_path)):
                    
                    relationship = KGRelationship(
                        id=uuid4(),
                        source_node_id=import_node.id,
                        target_node_id=node.id,
                        relationship_type=RelationshipType.IMPORTS,
                        confidence_score=0.7,
                        context_info={"cross_file": True},
                    )
                    relationships.append(relationship)
                    break

            if progress_callback and i % 10 == 0:
                progress = 50 + int((i / len(import_nodes)) * 20)  # 20% for cross-file
                progress_callback(f"Processing imports {i}/{len(import_nodes)}", progress)

        # Process cross-file function calls and usage
        for file_path, content in file_contents.items():
            if cancellation_check:
                cancellation_check()

            file_nodes = [node for node in all_nodes if node.file_path == file_path]
            if not file_nodes:
                continue

            # Detect cross-file references
            for node in all_nodes:
                if node.file_path != file_path and node.name in content:
                    # Find which node in current file references the external node
                    lines = content.split('\n')
                    for line_num, line in enumerate(lines, 1):
                        if node.name in line:
                            referencer = self._find_node_at_line(file_nodes, line_num)
                            if referencer:
                                relationship = KGRelationship(
                                    id=uuid4(),
                                    source_node_id=referencer.id,
                                    target_node_id=node.id,
                                    relationship_type=RelationshipType.USES,
                                    confidence_score=0.6,
                                    context_info={
                                        "cross_file": True,
                                        "line": line_num,
                                        "reference_type": "name_match"
                                    },
                                )
                                relationships.append(relationship)
                                break

        return relationships

    async def _build_containment_relationships(
        self,
        nodes: List[KGNode],
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> List[KGRelationship]:
        """Build containment relationships (file contains class, class contains method, etc.)."""
        relationships = []
        
        # Group nodes by file
        nodes_by_file = defaultdict(list)
        for node in nodes:
            nodes_by_file[node.file_path].append(node)

        for file_path, file_nodes in nodes_by_file.items():
            if cancellation_check:
                cancellation_check()

            # Find file node
            file_node = None
            for node in file_nodes:
                if node.node_type == NodeType.FILE:
                    file_node = node
                    break
            
            if not file_node:
                continue

            # Sort nodes by line number for hierarchical containment
            non_file_nodes = [node for node in file_nodes if node.node_type != NodeType.FILE]
            non_file_nodes.sort(key=lambda x: x.line_start or 0)

            # Build containment hierarchy
            for node in non_file_nodes:
                parent_node = self._find_parent_node(node, non_file_nodes)
                
                if parent_node:
                    # Node is contained within another node (e.g., method in class)
                    relationship = KGRelationship(
                        id=uuid4(),
                        source_node_id=parent_node.id,
                        target_node_id=node.id,
                        relationship_type=RelationshipType.CONTAINS,
                        confidence_score=1.0,
                        context_info={"containment_type": "hierarchical"},
                    )
                    relationships.append(relationship)
                else:
                    # Node is directly contained in file
                    relationship = KGRelationship(
                        id=uuid4(),
                        source_node_id=file_node.id,
                        target_node_id=node.id,
                        relationship_type=RelationshipType.CONTAINS,
                        confidence_score=1.0,
                        context_info={"containment_type": "file_level"},
                    )
                    relationships.append(relationship)

        return relationships

    def _find_node_at_line(self, nodes: List[KGNode], line_num: int) -> Optional[KGNode]:
        """Find the node that contains the given line number."""
        # Sort by line start to find the most specific container
        candidates = []
        
        for node in nodes:
            if (node.line_start and node.line_end and 
                node.line_start <= line_num <= node.line_end):
                candidates.append(node)
            elif node.line_start and node.line_start <= line_num:
                candidates.append(node)

        if not candidates:
            return None

        # Return the most specific node (latest line start)
        return max(candidates, key=lambda x: x.line_start or 0)

    def _find_parent_node(self, node: KGNode, all_nodes: List[KGNode]) -> Optional[KGNode]:
        """Find the parent node that contains the given node."""
        if not node.line_start:
            return None

        candidates = []
        for candidate in all_nodes:
            if (candidate.id != node.id and 
                candidate.line_start and candidate.line_end and
                candidate.line_start < node.line_start and
                candidate.line_end > (node.line_end or node.line_start)):
                candidates.append(candidate)

        if not candidates:
            return None

        # Return the most immediate parent (smallest range containing the node)
        return min(candidates, key=lambda x: (x.line_end or 0) - (x.line_start or 0))

    async def analyze_dependencies(
        self,
        nodes: List[KGNode],
        relationships: List[KGRelationship],
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> Dict[str, Any]:
        """
        Analyze dependency patterns and complexity metrics.
        
        Args:
            nodes: List of code nodes
            relationships: List of relationships
            cancellation_check: Optional callback to check for cancellation
            
        Returns:
            Dictionary containing dependency analysis results
        """
        analysis = {
            "dependency_graph": {},
            "circular_dependencies": [],
            "complexity_hotspots": [],
            "coupling_metrics": {},
            "cohesion_metrics": {},
        }

        if cancellation_check:
            cancellation_check()

        # Build dependency graph
        dep_graph = defaultdict(set)
        for rel in relationships:
            if rel.relationship_type in [RelationshipType.DEPENDS_ON, RelationshipType.IMPORTS, RelationshipType.USES]:
                dep_graph[str(rel.source_node_id)].add(str(rel.target_node_id))

        analysis["dependency_graph"] = {k: list(v) for k, v in dep_graph.items()}

        # Detect circular dependencies
        analysis["circular_dependencies"] = self._detect_cycles(dep_graph)

        # Find complexity hotspots
        complexity_scores = {}
        for node in nodes:
            if node.complexity_score:
                complexity_scores[str(node.id)] = {
                    "name": node.name,
                    "file_path": node.file_path,
                    "complexity": node.complexity_score,
                    "type": node.node_type.value,
                }

        # Sort by complexity and take top hotspots
        sorted_complex = sorted(complexity_scores.items(), key=lambda x: x[1]["complexity"], reverse=True)
        analysis["complexity_hotspots"] = [item[1] for item in sorted_complex[:10]]

        # Calculate coupling metrics (fan-in, fan-out)
        fan_in = defaultdict(int)
        fan_out = defaultdict(int)
        
        for rel in relationships:
            if rel.relationship_type in [RelationshipType.CALLS, RelationshipType.USES]:
                fan_out[str(rel.source_node_id)] += 1
                fan_in[str(rel.target_node_id)] += 1

        analysis["coupling_metrics"] = {
            "fan_in": dict(fan_in),
            "fan_out": dict(fan_out),
            "highly_coupled": [
                node_id for node_id, count in fan_in.items() if count > 5
            ] + [
                node_id for node_id, count in fan_out.items() if count > 5
            ]
        }

        return analysis

    def _detect_cycles(self, graph: Dict[str, Set[str]]) -> List[List[str]]:
        """Detect circular dependencies in the dependency graph."""
        visited = set()
        rec_stack = set()
        cycles = []

        def dfs(node: str, path: List[str]) -> None:
            if node in rec_stack:
                # Found a cycle
                cycle_start = path.index(node)
                cycles.append(path[cycle_start:] + [node])
                return

            if node in visited:
                return

            visited.add(node)
            rec_stack.add(node)
            path.append(node)

            for neighbor in graph.get(node, set()):
                dfs(neighbor, path.copy())

            rec_stack.remove(node)

        for node in graph:
            if node not in visited:
                dfs(node, [])

        return cycles

    async def build_graph_statistics(
        self,
        nodes: List[KGNode],
        relationships: List[KGRelationship],
    ) -> Dict[str, Any]:
        """
        Build comprehensive statistics about the knowledge graph.
        
        Args:
            nodes: List of all nodes in the graph
            relationships: List of all relationships in the graph
            
        Returns:
            Dictionary containing graph statistics
        """
        stats = {
            "total_nodes": len(nodes),
            "total_relationships": len(relationships),
            "nodes_by_type": {},
            "relationships_by_type": {},
            "languages": {},
            "files_analyzed": set(),
            "complexity_distribution": {"low": 0, "medium": 0, "high": 0},
            "cross_file_relationships": 0,
            "average_complexity": 0.0,
        }

        # Count nodes by type
        for node in nodes:
            node_type = node.node_type.value
            stats["nodes_by_type"][node_type] = stats["nodes_by_type"].get(node_type, 0) + 1
            
            # Track languages
            if node.language:
                stats["languages"][node.language] = stats["languages"].get(node.language, 0) + 1
            
            # Track files
            stats["files_analyzed"].add(node.file_path)
            
            # Complexity distribution
            if node.complexity_score:
                if node.complexity_score <= 3:
                    stats["complexity_distribution"]["low"] += 1
                elif node.complexity_score <= 6:
                    stats["complexity_distribution"]["medium"] += 1
                else:
                    stats["complexity_distribution"]["high"] += 1

        # Count relationships by type
        cross_file_count = 0
        for rel in relationships:
            rel_type = rel.relationship_type.value
            stats["relationships_by_type"][rel_type] = stats["relationships_by_type"].get(rel_type, 0) + 1
            
            # Count cross-file relationships
            if rel.context_info and rel.context_info.get("cross_file"):
                cross_file_count += 1

        stats["cross_file_relationships"] = cross_file_count
        stats["files_analyzed"] = len(stats["files_analyzed"])

        # Calculate average complexity
        complexity_scores = [node.complexity_score for node in nodes if node.complexity_score]
        if complexity_scores:
            stats["average_complexity"] = sum(complexity_scores) / len(complexity_scores)

        return stats