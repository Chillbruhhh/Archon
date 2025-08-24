"""
Smart File Filter Service for Knowledge Graph Parsing

This module provides intelligent file filtering to exclude non-code files, configuration files,
and other content that shouldn't be included in knowledge graphs. It implements gitignore-style
pattern matching and supports language-specific exclusions.
"""

import re
from pathlib import Path
from typing import List, Set, Optional
import fnmatch


class FileFilter:
    """Smart file filter for knowledge graph parsing with gitignore-style pattern matching."""
    
    def __init__(self):
        """Initialize the file filter with default exclusion patterns."""
        self.excluded_extensions = self._get_default_excluded_extensions()
        self.excluded_patterns = self._get_default_excluded_patterns()
        self.excluded_directories = self._get_default_excluded_directories()
        self.max_file_size_kb = 500  # Default max file size in KB
        
    def _get_default_excluded_extensions(self) -> Set[str]:
        """Get default file extensions to exclude from parsing."""
        return {
            # Configuration files
            '.yaml', '.yml', '.json', '.toml', '.ini', '.cfg', '.conf',
            
            # Documentation files
            '.md', '.txt', '.rst', '.adoc', '.tex',
            
            # Lock and dependency files
            '.lock', '.frozen', '.pipfile', '.poetry.lock', 'package-lock.json',
            'yarn.lock', 'composer.lock', 'Gemfile.lock', 'Cargo.lock',
            
            # Binary and media files
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.zip', '.tar', '.gz', '.bz2', '.rar', '.7z',
            '.exe', '.bin', '.so', '.dll', '.dylib',
            
            # IDE and editor files
            '.swp', '.swo', '.tmp', '.bak', '.backup', '.orig',
            
            # OS files
            '.ds_store', 'thumbs.db', 'desktop.ini',
            
            # Log files
            '.log', '.logs',
            
            # Database files
            '.db', '.sqlite', '.sqlite3',
            
            # Certificate and key files
            '.pem', '.key', '.crt', '.cer', '.p12', '.pfx',
            
            # Environment and secrets
            '.env', '.env.local', '.env.production', '.env.development',
            
            # MinJS and compiled files
            '.min.js', '.min.css', '.bundle.js', '.bundle.css',
        }
    
    def _get_default_excluded_patterns(self) -> List[str]:
        """Get default filename patterns to exclude."""
        return [
            # Package manager files
            'package-lock.json', 'yarn.lock', 'composer.lock', 'Gemfile.lock',
            'Pipfile.lock', 'poetry.lock', 'Cargo.lock', 'go.sum',
            'requirements*.txt', 'setup.py', 'setup.cfg', 'pyproject.toml',
            
            # Build and configuration files
            'Makefile', 'makefile', 'CMakeLists.txt', 'Dockerfile*',
            'docker-compose*.yml', 'docker-compose*.yaml',
            '.gitignore', '.gitattributes', '.gitmodules',
            '.eslintrc*', '.prettierrc*', '.editorconfig', '.babelrc*',
            'tsconfig*.json', 'webpack*.js', 'rollup*.js', 'vite*.js',
            
            # CI/CD files
            '.travis.yml', '.circleci*', 'appveyor.yml', 'azure-pipelines.yml',
            '.github/workflows/*', '.gitlab-ci.yml', 'Jenkinsfile',
            
            # IDE configuration
            '.vscode/*', '.idea/*', '*.sublime-*', '.vs/*',
            
            # License and legal files
            'LICENSE*', 'COPYING*', 'COPYRIGHT*', 'NOTICE*',
            'DISCLAIMER*', 'TERMS*', 'PRIVACY*',
            
            # Documentation files
            'README*', 'CHANGELOG*', 'HISTORY*', 'AUTHORS*', 'CONTRIBUTORS*',
            'INSTALL*', 'USAGE*', 'TUTORIAL*', 'GUIDE*', 'FAQ*',
            
            # Generated files
            '*.generated.*', '*.gen.*', '*_pb2.py', '*_pb2_grpc.py',
            
            # Test data and fixtures
            '*.fixture.*', '*.mock.*', 'test_data/*', 'fixtures/*',
            
            # Minified files
            '*.min.*', '*.bundle.*', '*.chunk.*',
        ]
    
    def _get_default_excluded_directories(self) -> Set[str]:
        """Get default directories to exclude from parsing."""
        return {
            # Dependency directories
            'node_modules', '__pycache__', '.pytest_cache', '.tox', 'venv', '.venv',
            'env', '.env', 'virtualenv', 'site-packages', 'vendor', 'third_party',
            
            # Build directories
            'build', 'dist', 'out', 'output', 'target', 'bin', 'obj',
            '.next', '.nuxt', 'public', 'static', 'assets',
            
            # IDE and editor directories
            '.vscode', '.idea', '.vs', '.sublime-text', '.atom',
            
            # Version control
            '.git', '.svn', '.hg', '.bzr',
            
            # OS directories
            '.DS_Store', 'Thumbs.db',
            
            # Cache directories
            '.cache', 'cache', '.tmp', 'tmp', 'temp',
            
            # Documentation builds
            '_build', 'docs/_build', 'site', '_site',
            
            # Test directories (often contain test data, not code)
            'test_data', 'testdata', 'fixtures', 'samples',
            
            # Generated code directories
            'generated', 'gen', 'auto', 'autogen',
        }
    
    def should_parse_file(self, file_path: str, file_size_bytes: Optional[int] = None) -> bool:
        """
        Determine if a file should be parsed for the knowledge graph.
        
        Args:
            file_path: Path to the file (relative or absolute)
            file_size_bytes: Size of the file in bytes (optional)
            
        Returns:
            True if the file should be parsed, False otherwise
        """
        path = Path(file_path)
        
        # Check file size if provided
        if file_size_bytes is not None:
            if file_size_bytes > (self.max_file_size_kb * 1024):
                return False
        
        # Check if file is in excluded directory
        if self._is_in_excluded_directory(path):
            return False
        
        # Check file extension
        if path.suffix.lower() in self.excluded_extensions:
            return False
        
        # Check filename patterns
        if self._matches_excluded_pattern(path.name):
            return False
        
        # Check full path patterns
        if self._matches_excluded_pattern(str(path)):
            return False
        
        return True
    
    def _is_in_excluded_directory(self, path: Path) -> bool:
        """Check if file is in an excluded directory."""
        path_parts = path.parts
        
        for part in path_parts:
            if part.lower() in self.excluded_directories:
                return True
            
            # Check for nested patterns like .git, __pycache__
            if part.startswith('.') and part[1:] in self.excluded_directories:
                return True
        
        return False
    
    def _matches_excluded_pattern(self, filename: str) -> bool:
        """Check if filename matches any excluded pattern."""
        filename_lower = filename.lower()
        
        for pattern in self.excluded_patterns:
            # Handle wildcard patterns
            if '*' in pattern or '?' in pattern:
                if fnmatch.fnmatch(filename_lower, pattern.lower()):
                    return True
            else:
                # Exact match
                if filename_lower == pattern.lower():
                    return True
                    
                # Prefix match for patterns like "README*"
                if pattern.endswith('*') and filename_lower.startswith(pattern[:-1].lower()):
                    return True
        
        return False
    
    def get_language_specific_inclusions(self, language: str) -> Set[str]:
        """
        Get file extensions that should be included for a specific language.
        
        Args:
            language: Programming language name
            
        Returns:
            Set of file extensions to include
        """
        language_extensions = {
            'python': {'.py', '.pyx', '.pyi', '.pyw'},
            'javascript': {'.js', '.jsx', '.mjs', '.cjs'},
            'typescript': {'.ts', '.tsx', '.d.ts'},
            'java': {'.java', '.groovy', '.scala', '.kt', '.kts'},
            'csharp': {'.cs', '.vb', '.fs', '.fsx'},
            'cpp': {'.cpp', '.cxx', '.cc', '.c', '.h', '.hpp', '.hxx'},
            'c': {'.c', '.h'},
            'go': {'.go'},
            'rust': {'.rs'},
            'php': {'.php', '.phtml', '.php3', '.php4', '.php5', '.phps'},
            'ruby': {'.rb', '.rbw', '.rake', '.gemspec'},
            'swift': {'.swift'},
            'kotlin': {'.kt', '.kts'},
            'dart': {'.dart'},
            'r': {'.r', '.R', '.rmd', '.Rmd'},
            'matlab': {'.m', '.mlx'},
            'shell': {'.sh', '.bash', '.zsh', '.fish', '.csh', '.tcsh'},
            'powershell': {'.ps1', '.psm1', '.psd1'},
            'sql': {'.sql', '.ddl', '.dml'},
            'html': {'.html', '.htm', '.xhtml'},
            'css': {'.css', '.scss', '.sass', '.less'},
            'xml': {'.xml', '.xsd', '.xsl', '.xslt'},
        }
        
        return language_extensions.get(language.lower(), set())
    
    def filter_files(self, file_paths: List[str], target_languages: Optional[List[str]] = None) -> tuple[List[str], List[str]]:
        """
        Filter a list of file paths into included and excluded files.
        
        Args:
            file_paths: List of file paths to filter
            target_languages: Optional list of target languages to focus on
            
        Returns:
            Tuple of (included_files, excluded_files)
        """
        included = []
        excluded = []
        
        # Build set of allowed extensions if target languages specified
        allowed_extensions = set()
        if target_languages:
            for lang in target_languages:
                allowed_extensions.update(self.get_language_specific_inclusions(lang))
        
        for file_path in file_paths:
            if self.should_parse_file(file_path):
                # If target languages specified, also check extension
                if target_languages:
                    ext = Path(file_path).suffix.lower()
                    if ext in allowed_extensions:
                        included.append(file_path)
                    else:
                        excluded.append(file_path)
                else:
                    included.append(file_path)
            else:
                excluded.append(file_path)
        
        return included, excluded
    
    def get_filtering_statistics(self, total_files: int, included_files: int) -> dict:
        """
        Get filtering statistics for reporting.
        
        Args:
            total_files: Total number of files found
            included_files: Number of files included for parsing
            
        Returns:
            Dictionary with filtering statistics
        """
        excluded_files = total_files - included_files
        
        return {
            "total_files_found": total_files,
            "files_included_for_parsing": included_files,
            "files_excluded_from_parsing": excluded_files,
            "inclusion_rate_percent": round((included_files / total_files * 100) if total_files > 0 else 0, 2),
            "exclusion_rate_percent": round((excluded_files / total_files * 100) if total_files > 0 else 0, 2),
            "max_file_size_kb": self.max_file_size_kb,
            "excluded_extensions_count": len(self.excluded_extensions),
            "excluded_patterns_count": len(self.excluded_patterns),
            "excluded_directories_count": len(self.excluded_directories),
        }
    
    def set_max_file_size(self, max_size_kb: int) -> None:
        """Set maximum file size for parsing in KB."""
        self.max_file_size_kb = max_size_kb
    
    def add_excluded_extension(self, extension: str) -> None:
        """Add a file extension to the exclusion list."""
        if not extension.startswith('.'):
            extension = '.' + extension
        self.excluded_extensions.add(extension.lower())
    
    def add_excluded_pattern(self, pattern: str) -> None:
        """Add a filename pattern to the exclusion list."""
        self.excluded_patterns.append(pattern)
    
    def add_excluded_directory(self, directory: str) -> None:
        """Add a directory name to the exclusion list."""
        self.excluded_directories.add(directory.lower())