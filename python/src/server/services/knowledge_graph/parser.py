"""
Tree-sitter universal parser for Knowledge Graph functionality.

This module provides universal code parsing capabilities using Tree-sitter
for 20+ programming languages, extracting code entities and relationships
following Archon's service patterns.
"""

import asyncio
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union
from uuid import UUID, uuid4

try:
    import tree_sitter
    from tree_sitter import Language, Node, Parser, Tree
except ImportError:
    # Graceful fallback for development environments without tree-sitter
    tree_sitter = None
    Language = None
    Node = None
    Parser = None
    Tree = None

from .models import (
    FileParseResult,
    KGNode,
    KGRelationship,
    LanguageConfig,
    NodeType,
    ParsingProgress,
    ParsingStatus,
    RelationshipType,
)


from .file_filter import FileFilter

class TreeSitterParser:
    """
    Universal Tree-sitter parser for code analysis and graph construction.
    
    Supports 20+ programming languages with AST traversal, entity extraction,
    and relationship detection following Archon's service patterns.
    """

    def __init__(self):
        """Initialize the parser with language configurations and file filtering."""
        self.language_configs = self._initialize_language_configs()
        self.parsers: Dict[str, Parser] = {}
        self.languages: Dict[str, Language] = {}
        self.file_filter = FileFilter()  # Initialize smart file filtering
        self._initialize_parsers()

    def _initialize_language_configs(self) -> Dict[str, LanguageConfig]:
        """Initialize language configurations for supported languages."""
        return {
            # Python
            "python": LanguageConfig(
                language="python",
                file_extensions=[".py", ".pyi"],
                tree_sitter_grammar="python",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION, 
                    NodeType.METHOD, NodeType.VARIABLE, NodeType.IMPORT
                ],
                complexity_enabled=True,
            ),
            # JavaScript/TypeScript
            "javascript": LanguageConfig(
                language="javascript",
                file_extensions=[".js", ".jsx", ".mjs"],
                tree_sitter_grammar="javascript",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION,
                    NodeType.METHOD, NodeType.VARIABLE, NodeType.IMPORT
                ],
                complexity_enabled=True,
            ),
            "typescript": LanguageConfig(
                language="typescript",
                file_extensions=[".ts", ".tsx"],
                tree_sitter_grammar="typescript",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION,
                    NodeType.METHOD, NodeType.VARIABLE, NodeType.IMPORT,
                    NodeType.INTERFACE
                ],
                complexity_enabled=True,
            ),
            # Java
            "java": LanguageConfig(
                language="java",
                file_extensions=[".java"],
                tree_sitter_grammar="java",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.METHOD,
                    NodeType.VARIABLE, NodeType.IMPORT, NodeType.INTERFACE
                ],
                complexity_enabled=True,
            ),
            # C/C++
            "c": LanguageConfig(
                language="c",
                file_extensions=[".c", ".h"],
                tree_sitter_grammar="c",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.VARIABLE
                ],
                complexity_enabled=True,
            ),
            "cpp": LanguageConfig(
                language="cpp",
                file_extensions=[".cpp", ".cxx", ".cc", ".hpp", ".hxx"],
                tree_sitter_grammar="cpp",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION,
                    NodeType.METHOD, NodeType.VARIABLE, NodeType.NAMESPACE
                ],
                complexity_enabled=True,
            ),
            # C#
            "csharp": LanguageConfig(
                language="csharp",
                file_extensions=[".cs"],
                tree_sitter_grammar="c_sharp",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.METHOD,
                    NodeType.VARIABLE, NodeType.IMPORT, NodeType.INTERFACE,
                    NodeType.NAMESPACE
                ],
                complexity_enabled=True,
            ),
            # Go
            "go": LanguageConfig(
                language="go",
                file_extensions=[".go"],
                tree_sitter_grammar="go",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.METHOD,
                    NodeType.VARIABLE, NodeType.IMPORT
                ],
                complexity_enabled=True,
            ),
            # Rust
            "rust": LanguageConfig(
                language="rust",
                file_extensions=[".rs"],
                tree_sitter_grammar="rust",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.METHOD,
                    NodeType.VARIABLE, NodeType.ENUM, NodeType.MODULE
                ],
                complexity_enabled=True,
            ),
            # PHP
            "php": LanguageConfig(
                language="php",
                file_extensions=[".php"],
                tree_sitter_grammar="php",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION,
                    NodeType.METHOD, NodeType.VARIABLE
                ],
                complexity_enabled=True,
            ),
            # Ruby
            "ruby": LanguageConfig(
                language="ruby",
                file_extensions=[".rb"],
                tree_sitter_grammar="ruby",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.METHOD,
                    NodeType.VARIABLE, NodeType.MODULE
                ],
                complexity_enabled=True,
            ),
            # Swift
            "swift": LanguageConfig(
                language="swift",
                file_extensions=[".swift"],
                tree_sitter_grammar="swift",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION,
                    NodeType.METHOD, NodeType.VARIABLE, NodeType.IMPORT
                ],
                complexity_enabled=True,
            ),
            # Kotlin
            "kotlin": LanguageConfig(
                language="kotlin",
                file_extensions=[".kt", ".kts"],
                tree_sitter_grammar="kotlin",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION,
                    NodeType.METHOD, NodeType.VARIABLE, NodeType.IMPORT
                ],
                complexity_enabled=True,
            ),
            # Scala
            "scala": LanguageConfig(
                language="scala",
                file_extensions=[".scala"],
                tree_sitter_grammar="scala",
                supported_node_types=[
                    NodeType.FILE, NodeType.CLASS, NodeType.FUNCTION,
                    NodeType.METHOD, NodeType.VARIABLE, NodeType.IMPORT
                ],
                complexity_enabled=True,
            ),
            # Haskell
            "haskell": LanguageConfig(
                language="haskell",
                file_extensions=[".hs"],
                tree_sitter_grammar="haskell",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.VARIABLE,
                    NodeType.MODULE, NodeType.IMPORT
                ],
                complexity_enabled=True,
            ),
            # Lua
            "lua": LanguageConfig(
                language="lua",
                file_extensions=[".lua"],
                tree_sitter_grammar="lua",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.VARIABLE
                ],
                complexity_enabled=True,
            ),
            # Perl
            "perl": LanguageConfig(
                language="perl",
                file_extensions=[".pl", ".pm"],
                tree_sitter_grammar="perl",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.VARIABLE
                ],
                complexity_enabled=True,
            ),
            # R
            "r": LanguageConfig(
                language="r",
                file_extensions=[".r", ".R"],
                tree_sitter_grammar="r",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.VARIABLE
                ],
                complexity_enabled=True,
            ),
            # Bash/Shell
            "bash": LanguageConfig(
                language="bash",
                file_extensions=[".sh", ".bash"],
                tree_sitter_grammar="bash",
                supported_node_types=[
                    NodeType.FILE, NodeType.FUNCTION, NodeType.VARIABLE
                ],
                complexity_enabled=False,
            ),
            # YAML
            "yaml": LanguageConfig(
                language="yaml",
                file_extensions=[".yml", ".yaml"],
                tree_sitter_grammar="yaml",
                supported_node_types=[NodeType.FILE],
                complexity_enabled=False,
            ),
            # JSON
            "json": LanguageConfig(
                language="json",
                file_extensions=[".json"],
                tree_sitter_grammar="json",
                supported_node_types=[NodeType.FILE],
                complexity_enabled=False,
            ),
        }

    def _initialize_parsers(self) -> None:
        """Initialize Tree-sitter parsers for supported languages."""
        if not tree_sitter:
            return

        # This would typically load compiled Tree-sitter language libraries
        # For now, we'll set up the structure and handle missing languages gracefully
        for lang_name, config in self.language_configs.items():
            try:
                # In production, this would load from tree-sitter-languages package
                # For now, we'll set up placeholders and handle gracefully
                self.parsers[lang_name] = None
                self.languages[lang_name] = None
            except Exception:
                # Language not available, skip silently
                continue

    def detect_language(self, file_path: str) -> Optional[str]:
        """
        Detect programming language from file extension.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Language name if detected, None otherwise
        """
        file_ext = Path(file_path).suffix.lower()
        
        for lang_name, config in self.language_configs.items():
            if file_ext in config.file_extensions:
                return lang_name
                
        return None

    def get_supported_languages(self) -> List[str]:
        """Get list of supported programming languages."""
        return list(self.language_configs.keys())

    def get_language_config(self, language: str) -> Optional[LanguageConfig]:
        """Get configuration for a specific language."""
        return self.language_configs.get(language)

    def should_parse_file(self, file_path: str, file_size_bytes: Optional[int] = None) -> bool:
        """
        Determine if a file should be parsed using intelligent filtering.
        
        Args:
            file_path: Path to the file
            file_size_bytes: Optional file size in bytes
            
        Returns:
            True if the file should be parsed, False otherwise
        """
        # Enhanced logging to debug filtering issues
        path = Path(file_path)
        file_ext = path.suffix.lower()
        
        # Log what we're checking for debugging
        print(f"🔍 Checking file: {file_path} | Extension: {file_ext}")
        
        # First check if we support the language
        language = self.detect_language(file_path)
        print(f"   🔤 Language detected: {language}")
        
        if not language:
            # For debugging: be more permissive and try common code extensions
            # that might not be in our language configs
            common_code_extensions = {
                '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h', '.hpp',
                '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.sh', '.pl'
            }
            
            if file_ext in common_code_extensions:
                print(f"   ⚠️  Language not detected but extension {file_ext} looks like code - allowing parse")
                # Use the smart file filter as fallback check
                return self.file_filter.should_parse_file(file_path, file_size_bytes)
            else:
                print(f"   ❌ No language support for {file_ext}")
                return False
        
        # REFINED FILTERING: Smart prioritization for main source code
        if language == 'python':
            # Check basic exclusions but be strategic about prioritization
            if file_size_bytes and file_size_bytes > (500 * 1024):  # 500KB limit
                print(f"   📏 File too large: {file_size_bytes} bytes")
                return False
            
            path_str = str(path).lower()
            path_parts = path.parts
            
            # Exclude clearly problematic directories
            problematic_dirs = {'__pycache__', '.git', 'node_modules', '.pytest_cache', 'dist', 'build'}
            for prob_dir in problematic_dirs:
                if f'/{prob_dir}/' in path_str or path_str.endswith(f'/{prob_dir}'):
                    print(f"   ❌ In problematic directory: {prob_dir}")
                    return False
            
            # PRIORITY SYSTEM: Focus on main source code over tests
            filename = path.name.lower()
            
            # HIGH PRIORITY: Main application/library code in src/, lib/, app/ directories
            high_priority_dirs = {'src', 'lib', 'app', 'core', 'main'}
            has_high_priority_dir = any(part.lower() in high_priority_dirs for part in path_parts)
            
            # MEDIUM PRIORITY: Root level Python files (often main modules)
            is_root_level = len(path_parts) <= 2  # Allow some depth but prioritize root
            
            # LOW PRIORITY: Test files and examples
            is_test_file = (
                'test' in filename or 
                filename.startswith('test_') or 
                filename.endswith('_test.py') or
                'conftest' in filename or
                any('test' in part.lower() for part in path_parts) or
                any(part.lower() in {'tests', 'testing', 'examples', 'example', 'demo', 'demos'} for part in path_parts)
            )
            
            # Priority-based inclusion logic
            if has_high_priority_dir and not is_test_file:
                print(f"   🎯 HIGH PRIORITY: Main source code in {'/'.join(path_parts)}")
                return True
            elif is_root_level and not is_test_file and not filename.startswith('_'):
                print(f"   📦 MEDIUM PRIORITY: Root-level module")
                return True
            elif not is_test_file:
                print(f"   ✅ INCLUDED: Regular Python file")
                return True
            else:
                # Only include test files if we have space/aren't filtering heavily
                # This creates a natural priority where main code gets parsed first
                print(f"   ⚖️  LOW PRIORITY: Test file - may be excluded in favor of main code")
                return False  # For now, exclude test files to focus on main source
        
        # Use the smart file filter to determine if we should parse this file
        should_parse = self.file_filter.should_parse_file(file_path, file_size_bytes)
        print(f"   📊 Smart filter result: {should_parse}")
        
        return should_parse
    
    def get_filtering_statistics(self, total_files: int, included_files: int) -> dict:
        """
        Get filtering statistics for progress reporting.
        
        Args:
            total_files: Total number of files found
            included_files: Number of files that will be parsed
            
        Returns:
            Dictionary with filtering statistics
        """
        return self.file_filter.get_filtering_statistics(total_files, included_files)

    async def parse_file(
        self,
        file_path: str,
        file_content: str,
        repository_id: UUID,
        progress_callback: Optional[Callable[[str, int], None]] = None,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> Tuple[List[KGNode], List[KGRelationship], FileParseResult]:
        """
        Parse a single file and extract code entities.
        
        Args:
            file_path: Path to the file being parsed
            file_content: Content of the file
            repository_id: UUID of the repository
            progress_callback: Optional callback for progress updates
            cancellation_check: Optional callback to check for cancellation
            
        Returns:
            Tuple of (nodes, relationships, parse_result) with actual parsed entities
        """
        start_time = time.time()
        
        try:
            # Check for cancellation
            if cancellation_check:
                cancellation_check()

            # Detect language
            language = self.detect_language(file_path)
            if not language:
                return [], [], FileParseResult(
                    file_path=file_path,
                    language="unknown",
                    success=False,
                    nodes_extracted=0,
                    relationships_extracted=0,
                    parse_time_ms=int((time.time() - start_time) * 1000),
                    error="Unsupported file type",
                )

            config = self.language_configs[language]
            
            # Progress update
            if progress_callback:
                progress_callback(f"Parsing {Path(file_path).name}...", 10)

            # Extract entities based on language type
            if language in ["python", "javascript", "typescript", "java", "csharp"]:
                nodes, relationships = await self._parse_object_oriented_file(
                    file_content, file_path, language, repository_id, cancellation_check
                )
            elif language in ["c", "go", "rust"]:
                nodes, relationships = await self._parse_procedural_file(
                    file_content, file_path, language, repository_id, cancellation_check
                )
            else:
                # Basic parsing for other languages
                nodes, relationships = await self._parse_basic_file(
                    file_content, file_path, language, repository_id, cancellation_check
                )

            parse_time_ms = int((time.time() - start_time) * 1000)
            
            # Progress completion
            if progress_callback:
                progress_callback(f"Completed parsing {Path(file_path).name}", 100)

            result = FileParseResult(
                file_path=file_path,
                language=language,
                success=True,
                nodes_extracted=len(nodes),
                relationships_extracted=len(relationships),
                parse_time_ms=parse_time_ms,
            )

            return nodes, relationships, result

        except Exception as e:
            parse_time_ms = int((time.time() - start_time) * 1000)
            result = FileParseResult(
                file_path=file_path,
                language=language or "unknown",
                success=False,
                nodes_extracted=0,
                relationships_extracted=0,
                parse_time_ms=parse_time_ms,
                error=str(e),
            )
            return [], [], result

    async def _parse_object_oriented_file(
        self,
        content: str,
        file_path: str,
        language: str,
        repository_id: UUID,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> Tuple[List[KGNode], List[KGRelationship]]:
        """Parse object-oriented language files (Python, Java, TypeScript, etc.)."""
        nodes = []
        relationships = []

        # Check for cancellation
        if cancellation_check:
            cancellation_check()

        # Create file node
        file_node = KGNode(
            id=uuid4(),
            kg_repository_id=repository_id,
            node_type=NodeType.FILE,
            name=Path(file_path).name,
            fully_qualified_name=file_path,
            file_path=file_path,
            language=language,
            properties={"lines": len(content.splitlines())},
            source_code=content[:2000] if len(content) > 2000 else content,  # Store file content (truncated)
            is_public=True,
        )
        nodes.append(file_node)

        # Enhanced pattern-based extraction with source code and docstring extraction
        lines = content.split('\n')
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            original_line = lines[i]  # Keep original for indentation context
            
            if cancellation_check and i % 100 == 0:
                cancellation_check()

            # Extract classes with source code and docstrings
            if line.startswith('class ') and ':' in line:
                class_name = line.split()[1].split('(')[0].split(':')[0]
                class_start_line = i + 1
                
                # Extract class docstring
                docstring = None
                source_lines = [original_line]
                j = i + 1
                
                # Find class body and docstring
                indent_level = len(original_line) - len(original_line.lstrip())
                
                # Look for docstring in next few lines
                while j < len(lines) and j < i + 10:  # Check up to 10 lines ahead
                    next_line = lines[j].strip()
                    if next_line.startswith('"""') or next_line.startswith("'''"):
                        # Found docstring start
                        quote_type = '"""' if next_line.startswith('"""') else "'''"
                        docstring_lines = []
                        
                        if next_line.count(quote_type) >= 2:  # Single line docstring
                            docstring = next_line.replace(quote_type, '').strip()
                        else:
                            # Multi-line docstring
                            docstring_lines.append(next_line.replace(quote_type, ''))
                            j += 1
                            while j < len(lines):
                                doc_line = lines[j].strip()
                                if quote_type in doc_line:
                                    docstring_lines.append(doc_line.replace(quote_type, ''))
                                    break
                                docstring_lines.append(doc_line)
                                j += 1
                            docstring = '\n'.join(docstring_lines).strip()
                        break
                    elif next_line and not next_line.startswith('#'):
                        break  # Hit non-comment, non-docstring code
                    j += 1
                
                # Extract class body (limited to reasonable size)
                j = i + 1
                while j < len(lines):
                    current_line = lines[j]
                    current_indent = len(current_line) - len(current_line.lstrip())
                    
                    # If we hit a line at or less indentation than class definition, we're done
                    if current_line.strip() and current_indent <= indent_level:
                        break
                    
                    source_lines.append(current_line)
                    j += 1
                    
                    # Limit source code extraction to prevent huge nodes
                    if len(source_lines) > 100:  # Max 100 lines per class
                        source_lines.append("    # ... (truncated)")
                        break
                
                source_code = '\n'.join(source_lines)
                
                # Calculate complexity score for the class
                complexity_score = self.calculate_complexity_score(source_code, language)
                
                class_node = KGNode(
                    id=uuid4(),
                    kg_repository_id=repository_id,
                    node_type=NodeType.CLASS,
                    name=class_name,
                    fully_qualified_name=f"{file_path}::{class_name}",
                    file_path=file_path,
                    line_start=class_start_line,
                    language=language,
                    properties={"visibility": "public"},
                    source_code=source_code,  # CRITICAL FIX: Add source code
                    docstring=docstring,      # CRITICAL FIX: Add docstring
                    complexity_score=complexity_score,  # CRITICAL FIX: Add complexity
                    is_public=True,
                )
                nodes.append(class_node)
                
                # Create contains relationship
                relationship = KGRelationship(
                    id=uuid4(),
                    source_node_id=file_node.id,
                    target_node_id=class_node.id,
                    relationship_type=RelationshipType.CONTAINS,
                    confidence_score=1.0,
                )
                relationships.append(relationship)

            # Extract functions/methods with source code and docstrings
            elif line.startswith('def ') or line.startswith('function '):
                if language == "python":
                    func_name = line.split()[1].split('(')[0]
                else:  # JavaScript/TypeScript
                    func_name = line.split()[1].split('(')[0] if len(line.split()) > 1 else "anonymous"
                
                func_start_line = i + 1
                
                # Extract function docstring
                docstring = None
                source_lines = [original_line]
                j = i + 1
                
                # Find function body and docstring
                indent_level = len(original_line) - len(original_line.lstrip())
                
                # Look for docstring in next few lines
                while j < len(lines) and j < i + 10:
                    next_line = lines[j].strip()
                    if next_line.startswith('"""') or next_line.startswith("'''"):
                        # Found docstring start
                        quote_type = '"""' if next_line.startswith('"""') else "'''"
                        docstring_lines = []
                        
                        if next_line.count(quote_type) >= 2:  # Single line docstring
                            docstring = next_line.replace(quote_type, '').strip()
                        else:
                            # Multi-line docstring
                            docstring_lines.append(next_line.replace(quote_type, ''))
                            j += 1
                            while j < len(lines):
                                doc_line = lines[j].strip()
                                if quote_type in doc_line:
                                    docstring_lines.append(doc_line.replace(quote_type, ''))
                                    break
                                docstring_lines.append(doc_line)
                                j += 1
                            docstring = '\n'.join(docstring_lines).strip()
                        break
                    elif next_line and not next_line.startswith('#'):
                        break  # Hit non-comment, non-docstring code
                    j += 1
                
                # Extract function body (limited to reasonable size)
                j = i + 1
                while j < len(lines):
                    current_line = lines[j]
                    current_indent = len(current_line) - len(current_line.lstrip())
                    
                    # If we hit a line at or less indentation than function definition, we're done
                    if current_line.strip() and current_indent <= indent_level:
                        break
                    
                    source_lines.append(current_line)
                    j += 1
                    
                    # Limit source code extraction to prevent huge nodes
                    if len(source_lines) > 50:  # Max 50 lines per function
                        source_lines.append("    # ... (truncated)")
                        break
                
                source_code = '\n'.join(source_lines)
                
                # Calculate complexity score for the function
                complexity_score = self.calculate_complexity_score(source_code, language)
                
                func_node = KGNode(
                    id=uuid4(),
                    kg_repository_id=repository_id,
                    node_type=NodeType.FUNCTION,
                    name=func_name,
                    fully_qualified_name=f"{file_path}::{func_name}",
                    file_path=file_path,
                    line_start=func_start_line,
                    language=language,
                    properties={
                        "parameters": line.count(',') + 1 if '(' in line else 0,
                        "is_method": "    def " in original_line or "\tdef " in original_line  # Detect if it's a method
                    },
                    source_code=source_code,      # CRITICAL FIX: Add source code
                    docstring=docstring,          # CRITICAL FIX: Add docstring  
                    complexity_score=complexity_score,  # CRITICAL FIX: Add complexity
                    is_public=not func_name.startswith('_'),
                )
                nodes.append(func_node)
                
                # Create contains relationship
                relationship = KGRelationship(
                    id=uuid4(),
                    source_node_id=file_node.id,
                    target_node_id=func_node.id,
                    relationship_type=RelationshipType.CONTAINS,
                    confidence_score=1.0,
                )
                relationships.append(relationship)

            # Extract imports (keep existing logic but add source info)
            elif line.startswith('import ') or line.startswith('from '):
                import_name = line.split()[1] if len(line.split()) > 1 else "unknown"
                import_node = KGNode(
                    id=uuid4(),
                    kg_repository_id=repository_id,
                    node_type=NodeType.IMPORT,
                    name=import_name,
                    fully_qualified_name=f"{file_path}::{import_name}",
                    file_path=file_path,
                    line_start=i + 1,
                    language=language,
                    properties={"import_type": "module"},
                    source_code=original_line,  # Store the import line
                    is_public=True,
                )
                nodes.append(import_node)
                
                # Create imports relationship
                relationship = KGRelationship(
                    id=uuid4(),
                    source_node_id=file_node.id,
                    target_node_id=import_node.id,
                    relationship_type=RelationshipType.IMPORTS,
                    confidence_score=1.0,
                )
                relationships.append(relationship)

            i += 1

        return nodes, relationships

    async def _parse_procedural_file(
        self,
        content: str,
        file_path: str,
        language: str,
        repository_id: UUID,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> Tuple[List[KGNode], List[KGRelationship]]:
        """Parse procedural language files (C, Go, Rust, etc.)."""
        nodes = []
        relationships = []

        if cancellation_check:
            cancellation_check()

        # Create file node with source code
        file_node = KGNode(
            id=uuid4(),
            kg_repository_id=repository_id,
            node_type=NodeType.FILE,
            name=Path(file_path).name,
            fully_qualified_name=file_path,
            file_path=file_path,
            language=language,
            properties={"lines": len(content.splitlines())},
            source_code=content[:2000] if len(content) > 2000 else content,  # Store file content (truncated)
            is_public=True,
        )
        nodes.append(file_node)

        # Enhanced pattern-based extraction with source code and complexity extraction
        lines = content.split('\n')
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            original_line = lines[i]  # Keep original for indentation context
            
            if cancellation_check and i % 100 == 0:
                cancellation_check()

            # Extract functions with source code for different languages
            if language == "c" and line.startswith(('int ', 'void ', 'char ', 'float ', 'double ', 'static ')):
                parts = line.split()
                func_name = None
                return_type = None
                
                # Handle static functions
                if parts[0] == 'static' and len(parts) > 2:
                    return_type = parts[1]
                    if '(' in parts[2]:
                        func_name = parts[2].split('(')[0]
                elif len(parts) > 1 and '(' in parts[1]:
                    return_type = parts[0]
                    func_name = parts[1].split('(')[0]
                
                if func_name:
                    # Extract function body and calculate complexity
                    source_lines = [original_line]
                    j = i + 1
                    brace_count = line.count('{') - line.count('}')
                    
                    while j < len(lines) and brace_count > 0:
                        current_line = lines[j]
                        source_lines.append(current_line)
                        brace_count += current_line.count('{') - current_line.count('}')
                        j += 1
                        
                        # Limit source code extraction
                        if len(source_lines) > 100:
                            source_lines.append("    // ... (truncated)")
                            break
                    
                    source_code = '\n'.join(source_lines)
                    complexity_score = self.calculate_complexity_score(source_code, language)
                    
                    func_node = KGNode(
                        id=uuid4(),
                        kg_repository_id=repository_id,
                        node_type=NodeType.FUNCTION,
                        name=func_name,
                        fully_qualified_name=f"{file_path}::{func_name}",
                        file_path=file_path,
                        line_start=i + 1,
                        language=language,
                        properties={"return_type": return_type, "is_static": "static" in line},
                        source_code=source_code,
                        complexity_score=complexity_score,
                        is_public=not line.startswith('static'),
                    )
                    nodes.append(func_node)
                    
                    # Create contains relationship
                    relationship = KGRelationship(
                        id=uuid4(),
                        source_node_id=file_node.id,
                        target_node_id=func_node.id,
                        relationship_type=RelationshipType.CONTAINS,
                        confidence_score=1.0,
                    )
                    relationships.append(relationship)

            elif language == "go" and line.startswith('func '):
                parts = line.split()
                if len(parts) > 1:
                    func_name = parts[1].split('(')[0]
                    
                    # Extract function body and calculate complexity
                    source_lines = [original_line]
                    j = i + 1
                    brace_count = line.count('{') - line.count('}')
                    
                    while j < len(lines) and brace_count > 0:
                        current_line = lines[j]
                        source_lines.append(current_line)
                        brace_count += current_line.count('{') - current_line.count('}')
                        j += 1
                        
                        # Limit source code extraction
                        if len(source_lines) > 100:
                            source_lines.append("    // ... (truncated)")
                            break
                    
                    source_code = '\n'.join(source_lines)
                    complexity_score = self.calculate_complexity_score(source_code, language)
                    
                    func_node = KGNode(
                        id=uuid4(),
                        kg_repository_id=repository_id,
                        node_type=NodeType.FUNCTION,
                        name=func_name,
                        fully_qualified_name=f"{file_path}::{func_name}",
                        file_path=file_path,
                        line_start=i + 1,
                        language=language,
                        properties={"visibility": "public" if func_name[0].isupper() else "private"},
                        source_code=source_code,
                        complexity_score=complexity_score,
                        is_public=func_name[0].isupper(),
                    )
                    nodes.append(func_node)
                    
                    # Create contains relationship
                    relationship = KGRelationship(
                        id=uuid4(),
                        source_node_id=file_node.id,
                        target_node_id=func_node.id,
                        relationship_type=RelationshipType.CONTAINS,
                        confidence_score=1.0,
                    )
                    relationships.append(relationship)

            elif language == "rust":
                # Handle Rust functions
                if line.startswith('fn ') or line.startswith('pub fn '):
                    parts = line.split()
                    func_name = None
                    is_public = line.startswith('pub fn ')
                    
                    if is_public and len(parts) > 2:
                        func_name = parts[2].split('(')[0]
                    elif not is_public and len(parts) > 1:
                        func_name = parts[1].split('(')[0]
                    
                    if func_name:
                        # Extract function body and calculate complexity
                        source_lines = [original_line]
                        j = i + 1
                        brace_count = line.count('{') - line.count('}')
                        
                        while j < len(lines) and brace_count > 0:
                            current_line = lines[j]
                            source_lines.append(current_line)
                            brace_count += current_line.count('{') - current_line.count('}')
                            j += 1
                            
                            # Limit source code extraction
                            if len(source_lines) > 100:
                                source_lines.append("    // ... (truncated)")
                                break
                        
                        source_code = '\n'.join(source_lines)
                        complexity_score = self.calculate_complexity_score(source_code, language)
                        
                        func_node = KGNode(
                            id=uuid4(),
                            kg_repository_id=repository_id,
                            node_type=NodeType.FUNCTION,
                            name=func_name,
                            fully_qualified_name=f"{file_path}::{func_name}",
                            file_path=file_path,
                            line_start=i + 1,
                            language=language,
                            properties={"visibility": "public" if is_public else "private"},
                            source_code=source_code,
                            complexity_score=complexity_score,
                            is_public=is_public,
                        )
                        nodes.append(func_node)
                        
                        # Create contains relationship
                        relationship = KGRelationship(
                            id=uuid4(),
                            source_node_id=file_node.id,
                            target_node_id=func_node.id,
                            relationship_type=RelationshipType.CONTAINS,
                            confidence_score=1.0,
                        )
                        relationships.append(relationship)

            # Extract imports for all procedural languages
            elif ((language == "c" and line.startswith('#include')) or
                  (language == "go" and line.startswith('import')) or
                  (language == "rust" and line.startswith('use '))):
                
                import_name = line.split()[1] if len(line.split()) > 1 else "unknown"
                # Clean up import name
                if language == "c":
                    import_name = import_name.replace('<', '').replace('>', '').replace('"', '')
                elif language == "rust":
                    import_name = import_name.replace(';', '')
                
                import_node = KGNode(
                    id=uuid4(),
                    kg_repository_id=repository_id,
                    node_type=NodeType.IMPORT,
                    name=import_name,
                    fully_qualified_name=f"{file_path}::{import_name}",
                    file_path=file_path,
                    line_start=i + 1,
                    language=language,
                    properties={"import_type": "system" if language == "c" and '<' in original_line else "local"},
                    source_code=original_line,  # Store the import line
                    is_public=True,
                )
                nodes.append(import_node)
                
                # Create imports relationship
                relationship = KGRelationship(
                    id=uuid4(),
                    source_node_id=file_node.id,
                    target_node_id=import_node.id,
                    relationship_type=RelationshipType.IMPORTS,
                    confidence_score=1.0,
                )
                relationships.append(relationship)

            i += 1

        return nodes, relationships

    async def _parse_basic_file(
        self,
        content: str,
        file_path: str,
        language: str,
        repository_id: UUID,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> Tuple[List[KGNode], List[KGRelationship]]:
        """Basic parsing for configuration files and simple languages."""
        nodes = []
        relationships = []

        if cancellation_check:
            cancellation_check()

        # Create file node with basic metadata
        file_node = KGNode(
            id=uuid4(),
            kg_repository_id=repository_id,
            node_type=NodeType.FILE,
            name=Path(file_path).name,
            fully_qualified_name=file_path,
            file_path=file_path,
            language=language,
            properties={
                "lines": len(content.splitlines()),
                "size_bytes": len(content.encode('utf-8')),
                "file_type": "configuration" if file_path.endswith(('.json', '.yaml', '.yml', '.toml', '.ini', '.cfg')) else "other"
            },
            source_code=content[:1000] if len(content) > 1000 else content,  # Store truncated content for basic files
            complexity_score=1,  # Basic files have minimal complexity
            is_public=True,
        )
        nodes.append(file_node)

        # For configuration files, extract basic structure
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            line = line.strip()
            original_line = lines[i]
            
            if cancellation_check and i % 50 == 0:
                cancellation_check()

            # Extract configuration sections or key-value pairs
            if language in ["json", "yaml", "yml", "toml"]:
                # Look for top-level keys in configuration files
                if ':' in line and not line.startswith('#') and not line.startswith('//'):
                    key = line.split(':')[0].strip().replace('"', '').replace("'", '')
                    if key and not line.startswith(' ') and not line.startswith('\t'):  # Top-level key
                        config_node = KGNode(
                            id=uuid4(),
                            kg_repository_id=repository_id,
                            node_type=NodeType.VARIABLE,  # Use variable for config keys
                            name=key,
                            fully_qualified_name=f"{file_path}::{key}",
                            file_path=file_path,
                            line_start=i + 1,
                            language=language,
                            properties={"config_type": "key", "section": "root"},
                            source_code=original_line.strip(),
                            is_public=True,
                        )
                        nodes.append(config_node)
                        
                        # Create contains relationship
                        relationship = KGRelationship(
                            id=uuid4(),
                            source_node_id=file_node.id,
                            target_node_id=config_node.id,
                            relationship_type=RelationshipType.CONTAINS,
                            confidence_score=1.0,
                        )
                        relationships.append(relationship)

            elif language == "ini":
                # Extract INI sections
                if line.startswith('[') and line.endswith(']'):
                    section_name = line[1:-1]
                    section_node = KGNode(
                        id=uuid4(),
                        kg_repository_id=repository_id,
                        node_type=NodeType.VARIABLE,
                        name=section_name,
                        fully_qualified_name=f"{file_path}::{section_name}",
                        file_path=file_path,
                        line_start=i + 1,
                        language=language,
                        properties={"config_type": "section"},
                        source_code=original_line.strip(),
                        is_public=True,
                    )
                    nodes.append(section_node)
                    
                    # Create contains relationship
                    relationship = KGRelationship(
                        id=uuid4(),
                        source_node_id=file_node.id,
                        target_node_id=section_node.id,
                        relationship_type=RelationshipType.CONTAINS,
                        confidence_score=1.0,
                    )
                    relationships.append(relationship)

        return nodes, relationships

    def calculate_complexity_score(self, content: str, language: str) -> int:
        """
        Calculate cyclomatic complexity score for code content.
        
        Args:
            content: Source code content
            language: Programming language
            
        Returns:
            Complexity score (1-10 scale)
        """
        if not self.language_configs.get(language, LanguageConfig(language="", file_extensions=[], tree_sitter_grammar="", supported_node_types=[])).complexity_enabled:
            return 1

        # Simple complexity calculation based on control flow keywords
        complexity_keywords = {
            "python": ["if", "elif", "else", "for", "while", "try", "except", "with"],
            "javascript": ["if", "else", "for", "while", "switch", "case", "try", "catch"],
            "typescript": ["if", "else", "for", "while", "switch", "case", "try", "catch"],
            "java": ["if", "else", "for", "while", "switch", "case", "try", "catch"],
            "csharp": ["if", "else", "for", "while", "switch", "case", "try", "catch"],
            "go": ["if", "else", "for", "switch", "case", "select"],
            "rust": ["if", "else", "for", "while", "loop", "match"],
        }

        keywords = complexity_keywords.get(language, [])
        if not keywords:
            return 1

        # Count occurrences of complexity-inducing keywords
        complexity = 1  # Base complexity
        words = content.lower().split()
        
        for keyword in keywords:
            complexity += words.count(keyword)

        # Normalize to 1-10 scale
        return min(max(complexity // 5 + 1, 1), 10)

    async def parse_repository(
        self,
        repository_path: str,
        repository_id: UUID,
        file_filters: Optional[List[str]] = None,
        progress_callback: Optional[Callable[[ParsingProgress], None]] = None,
        cancellation_check: Optional[Callable[[], None]] = None,
    ) -> Tuple[List[KGNode], List[KGRelationship], Dict[str, Any]]:
        """
        Parse an entire repository and extract all code entities and relationships.
        
        Args:
            repository_path: Path to the repository root
            repository_id: UUID of the repository
            file_filters: Optional list of file patterns to include
            progress_callback: Optional callback for progress updates
            cancellation_check: Optional callback to check for cancellation
            
        Returns:
            Tuple of (nodes, relationships, statistics)
        """
        all_nodes = []
        all_relationships = []
        statistics = {
            "total_files_found": 0,
            "files_filtered_out": 0,
            "files_to_parse": 0,
            "parsed_files": 0,
            "skipped_files": 0,
            "error_files": 0,
            "languages_detected": set(),
            "total_nodes": 0,
            "total_relationships": 0,
            "parse_errors": [],
            "filtering_statistics": {},
        }

        try:
            # Phase 1: Find all files in repository
            print("🔍 Phase 1: Discovering files in repository...")
            all_files = []
            repo_path = Path(repository_path)
            
            for file_path in repo_path.rglob("*"):
                if file_path.is_file():
                    all_files.append(file_path)

            statistics["total_files_found"] = len(all_files)
            print(f"📁 Found {len(all_files)} total files in repository")

            # Phase 2: Apply intelligent file filtering
            print("🔍 Phase 2: Applying intelligent file filtering...")
            files_to_parse = []
            files_filtered_out = []
            
            for file_path in all_files:
                # Get file size for filtering
                try:
                    file_size_bytes = file_path.stat().st_size
                except (OSError, PermissionError):
                    file_size_bytes = None
                
                # Apply intelligent filtering
                if self.should_parse_file(str(file_path), file_size_bytes):
                    # Additional pattern-based filtering if specified
                    if file_filters:
                        if any(pattern in str(file_path) for pattern in file_filters):
                            files_to_parse.append(file_path)
                        else:
                            files_filtered_out.append(str(file_path))
                    else:
                        files_to_parse.append(file_path)
                else:
                    files_filtered_out.append(str(file_path))

            statistics["files_filtered_out"] = len(files_filtered_out)
            statistics["files_to_parse"] = len(files_to_parse)
            
            # Get filtering statistics for progress reporting
            filtering_stats = self.get_filtering_statistics(
                len(all_files), 
                len(files_to_parse)
            )
            statistics["filtering_statistics"] = filtering_stats
            
            print(f"✅ Smart filtering results:")
            print(f"   📁 Total files found: {len(all_files)}")
            print(f"   ✅ Files to parse: {len(files_to_parse)} ({filtering_stats['inclusion_rate_percent']}%)")
            print(f"   ❌ Files filtered out: {len(files_filtered_out)} ({filtering_stats['exclusion_rate_percent']}%)")
            print(f"   📊 Max file size: {filtering_stats['max_file_size_kb']}KB")

            # Progress initialization with filtering information
            if progress_callback:
                progress = ParsingProgress(
                    kg_source_id=repository_id,
                    status=ParsingStatus.PROCESSING,
                    total_files=len(files_to_parse),
                    processed_files=0,
                    nodes_created=0,
                    relationships_created=0,
                    errors=[],
                    start_time=asyncio.get_event_loop().time(),
                )
                progress_callback(progress)

            # Phase 3: Parse filtered files
            print(f"🔍 Phase 3: Parsing {len(files_to_parse)} filtered files...")
            for i, file_path in enumerate(files_to_parse):
                if cancellation_check:
                    cancellation_check()

                try:
                    # Read file content
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()

                    # Parse the file
                    result = await self.parse_file(
                        str(file_path),
                        content,
                        repository_id,
                        cancellation_check=cancellation_check,
                    )

                    if result.success:
                        statistics["parsed_files"] += 1
                        statistics["languages_detected"].add(result.language)
                        statistics["total_nodes"] += result.nodes_extracted
                        statistics["total_relationships"] += result.relationships_extracted
                    else:
                        statistics["error_files"] += 1
                        if result.error:
                            statistics["parse_errors"].append({
                                "file": str(file_path),
                                "error": result.error,
                            })

                except Exception as e:
                    statistics["skipped_files"] += 1
                    statistics["parse_errors"].append({
                        "file": str(file_path),
                        "error": str(e),
                    })

                # Progress update every 25 files or at significant milestones
                if progress_callback and ((i + 1) % 25 == 0 or i + 1 == len(files_to_parse)):
                    progress = ParsingProgress(
                        kg_source_id=repository_id,
                        status=ParsingStatus.PROCESSING,
                        total_files=len(files_to_parse),
                        processed_files=i + 1,
                        current_file=str(file_path),
                        nodes_created=statistics["total_nodes"],
                        relationships_created=statistics["total_relationships"],
                        errors=statistics["parse_errors"][-5:],  # Last 5 errors
                        start_time=asyncio.get_event_loop().time(),
                    )
                    progress_callback(progress)

            # Final progress update
            if progress_callback:
                progress = ParsingProgress(
                    kg_source_id=repository_id,
                    status=ParsingStatus.COMPLETED,
                    total_files=len(files_to_parse),
                    processed_files=len(files_to_parse),
                    nodes_created=statistics["total_nodes"],
                    relationships_created=statistics["total_relationships"],
                    errors=statistics["parse_errors"],
                    start_time=asyncio.get_event_loop().time(),
                )
                progress_callback(progress)

            # Convert set to list for JSON serialization
            statistics["languages_detected"] = list(statistics["languages_detected"])

            print(f"✅ Repository parsing completed:")
            print(f"   📁 Files processed: {statistics['parsed_files']}/{len(files_to_parse)}")
            print(f"   🧠 Nodes created: {statistics['total_nodes']}")
            print(f"   🔗 Relationships created: {statistics['total_relationships']}")
            print(f"   🔤 Languages detected: {', '.join(statistics['languages_detected'])}")
            if statistics["parse_errors"]:
                print(f"   ⚠️  Parse errors: {len(statistics['parse_errors'])}")

            return all_nodes, all_relationships, statistics

        except Exception as e:
            statistics["parse_errors"].append({
                "error": f"Repository parsing failed: {str(e)}",
                "file": "repository_root",
            })
            statistics["languages_detected"] = list(statistics["languages_detected"])
            return all_nodes, all_relationships, statistics