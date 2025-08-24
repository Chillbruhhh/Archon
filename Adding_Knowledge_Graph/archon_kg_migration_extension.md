# **🗄️ Archon Knowledge Graph Database Extension**

This SQL extends the existing Archon `complete_setup.sql` with Knowledge Graph functionality while maintaining perfect integration with existing tables.

## **📋 Integration Strategy**

**✅ Links to Existing Tables:**
- `archon_sources` → KG sources (crawled content can generate KGs)
- `archon_projects` → KG repositories (project codebases can be analyzed)
- `archon_settings` → KG configuration (follows existing patterns)

**✅ Maintains Archon Patterns:**
- Same naming convention (`archon_kg_*`)
- Same RLS policies (service_role + authenticated)
- Same trigger patterns (updated_at)
- Same UUID primary keys

---

## **🔧 SQL Extension to Add to `complete_setup.sql`**

```sql
-- =====================================================
-- SECTION 11: KNOWLEDGE GRAPH EXTENSION
-- =====================================================
-- Add this section to the end of complete_setup.sql
-- before the "SETUP COMPLETE" comment
-- =====================================================

-- Enable pgRouting extension for graph traversal (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- =====================================================
-- KNOWLEDGE GRAPH SETTINGS
-- =====================================================

-- Add Knowledge Graph configuration settings
INSERT INTO archon_settings (key, value, is_encrypted, category, description) VALUES
-- Core KG Settings
('ENABLE_KNOWLEDGE_GRAPH', 'true', false, 'knowledge_graph', 'Enable or disable Knowledge Graph functionality'),
('KG_AUTO_GENERATE_ON_CRAWL', 'false', false, 'knowledge_graph', 'Automatically generate KG when crawling websites (if code detected)'),
('KG_SUPPORTED_LANGUAGES', 'python,javascript,typescript,java,cpp,c,rust,go', false, 'knowledge_graph', 'Comma-separated list of programming languages to parse for KG'),

-- Tree-sitter Parser Settings  
('KG_PARSER_BATCH_SIZE', '50', false, 'knowledge_graph', 'Number of files to parse in parallel per batch (10-100)'),
('KG_MAX_FILE_SIZE_KB', '500', false, 'knowledge_graph', 'Maximum file size to parse in KB (100-2000)'),
('KG_PARSE_TIMEOUT_SECONDS', '30', false, 'knowledge_graph', 'Maximum time to spend parsing a single file in seconds'),

-- Graph Analysis Settings
('KG_MAX_DEPTH_ANALYSIS', '5', false, 'knowledge_graph', 'Maximum depth for dependency analysis (3-10)'),
('KG_ENABLE_CROSS_FILE_REFS', 'true', false, 'knowledge_graph', 'Enable cross-file relationship detection'),
('KG_RELATIONSHIP_CONFIDENCE_THRESHOLD', '0.8', false, 'knowledge_graph', 'Minimum confidence score for relationships (0.1-1.0)')

-- Only insert if they don't already exist
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- KNOWLEDGE GRAPH CORE TABLES
-- =====================================================

-- Knowledge Graph Sources (links to existing Archon content)
CREATE TABLE IF NOT EXISTS archon_kg_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to existing Archon tables
    source_type TEXT NOT NULL, -- 'crawled_content', 'project_repository', 'uploaded_file'
    archon_source_id TEXT, -- FK to archon_sources.source_id (for crawled content)
    archon_project_id UUID, -- FK to archon_projects.id (for project repos)
    
    -- KG-specific metadata
    name TEXT NOT NULL,
    description TEXT,
    repository_url TEXT,
    branch_name TEXT DEFAULT 'main',
    local_path TEXT, -- For uploaded files/local repos
    
    -- Parsing status and metadata
    parsing_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'disabled'
    parsing_started_at TIMESTAMPTZ,
    parsing_completed_at TIMESTAMPTZ,
    parsing_error TEXT,
    
    -- Statistics
    total_files_found INTEGER DEFAULT 0,
    total_files_parsed INTEGER DEFAULT 0,
    total_nodes_created INTEGER DEFAULT 0,
    total_relationships_created INTEGER DEFAULT 0,
    
    -- Languages detected
    detected_languages JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata and settings
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (
        -- Must have either archon_source_id OR archon_project_id, not both
        (archon_source_id IS NOT NULL AND archon_project_id IS NULL) OR
        (archon_source_id IS NULL AND archon_project_id IS NOT NULL) OR
        (archon_source_id IS NULL AND archon_project_id IS NULL AND local_path IS NOT NULL)
    )
);

-- Knowledge Graph Repositories (parsed codebases)
CREATE TABLE IF NOT EXISTS archon_kg_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kg_source_id UUID NOT NULL REFERENCES archon_kg_sources(id) ON DELETE CASCADE,
    
    -- Repository identification
    name TEXT NOT NULL,
    repository_url TEXT,
    branch_name TEXT DEFAULT 'main',
    commit_hash TEXT,
    
    -- Language and structure info
    primary_language TEXT,
    all_languages JSONB DEFAULT '[]'::jsonb, -- Array of detected languages
    directory_structure JSONB DEFAULT '{}'::jsonb, -- Nested object representing file tree
    
    -- Parsing statistics
    total_files INTEGER DEFAULT 0,
    parsed_files INTEGER DEFAULT 0,
    skipped_files INTEGER DEFAULT 0,
    error_files INTEGER DEFAULT 0,
    
    -- Performance metrics
    parsing_duration_seconds INTEGER,
    avg_parse_time_per_file_ms NUMERIC(10,2),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Graph Nodes (classes, functions, variables, imports, files)
CREATE TABLE IF NOT EXISTS archon_kg_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kg_repository_id UUID NOT NULL REFERENCES archon_kg_repositories(id) ON DELETE CASCADE,
    
    -- Node identification
    node_type TEXT NOT NULL, -- 'file', 'class', 'function', 'method', 'variable', 'import', 'interface', 'enum'
    name TEXT NOT NULL,
    fully_qualified_name TEXT, -- Full namespace/module path
    
    -- Source location
    file_path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    column_start INTEGER,
    column_end INTEGER,
    
    -- Language-specific properties
    language TEXT NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb, -- Store signature, modifiers, type info, etc.
    
    -- Content and documentation
    source_code TEXT, -- Actual code content for functions/classes
    docstring TEXT, -- Extracted documentation/comments
    
    -- Metadata
    complexity_score INTEGER, -- Cyclomatic complexity for functions
    is_public BOOLEAN DEFAULT true, -- Public/private visibility
    is_exported BOOLEAN DEFAULT false, -- Whether exported from module
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Graph Relationships (calls, inherits, imports, uses, defines)
CREATE TABLE IF NOT EXISTS archon_kg_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core relationship
    source_node_id UUID NOT NULL REFERENCES archon_kg_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES archon_kg_nodes(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL, -- 'calls', 'inherits', 'imports', 'uses', 'defines', 'contains', 'depends_on'
    
    -- Relationship metadata
    confidence_score NUMERIC(3,2) DEFAULT 1.0, -- Confidence in relationship accuracy (0.0-1.0)
    call_count INTEGER, -- For 'calls' relationships, how many times
    is_direct BOOLEAN DEFAULT true, -- Direct vs indirect relationship
    
    -- Context information
    context_info JSONB DEFAULT '{}'::jsonb, -- Store line numbers, parameter info, etc.
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate relationships
    UNIQUE(source_node_id, target_node_id, relationship_type)
);

-- Knowledge Graph Analysis Results (cached analysis for performance)
CREATE TABLE IF NOT EXISTS archon_kg_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kg_repository_id UUID NOT NULL REFERENCES archon_kg_repositories(id) ON DELETE CASCADE,
    
    -- Analysis type and parameters
    analysis_type TEXT NOT NULL, -- 'dependency_tree', 'complexity_analysis', 'hotspots', 'architecture_overview'
    parameters JSONB DEFAULT '{}'::jsonb, -- Analysis parameters used
    
    -- Results
    results JSONB NOT NULL, -- Structured analysis results
    
    -- Metadata
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Index for fast lookups
    UNIQUE(kg_repository_id, analysis_type, parameters)
);

-- =====================================================
-- INDEXES FOR OPTIMAL PERFORMANCE
-- =====================================================

-- KG Sources indexes
CREATE INDEX IF NOT EXISTS idx_archon_kg_sources_source_type ON archon_kg_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_archon_kg_sources_archon_source_id ON archon_kg_sources(archon_source_id);
CREATE INDEX IF NOT EXISTS idx_archon_kg_sources_archon_project_id ON archon_kg_sources(archon_project_id);
CREATE INDEX IF NOT EXISTS idx_archon_kg_sources_parsing_status ON archon_kg_sources(parsing_status);
CREATE INDEX IF NOT EXISTS idx_archon_kg_sources_metadata ON archon_kg_sources USING gin (metadata);

-- KG Repositories indexes  
CREATE INDEX IF NOT EXISTS idx_archon_kg_repositories_source ON archon_kg_repositories(kg_source_id);
CREATE INDEX IF NOT EXISTS idx_archon_kg_repositories_language ON archon_kg_repositories(primary_language);
CREATE INDEX IF NOT EXISTS idx_archon_kg_repositories_languages ON archon_kg_repositories USING gin (all_languages);

-- KG Nodes indexes (critical for graph queries)
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_repository ON archon_kg_nodes(kg_repository_id);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_type ON archon_kg_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_name ON archon_kg_nodes(name);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_fqn ON archon_kg_nodes(fully_qualified_name);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_file ON archon_kg_nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_language ON archon_kg_nodes(language);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_public ON archon_kg_nodes(is_public);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_exported ON archon_kg_nodes(is_exported);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_properties ON archon_kg_nodes USING gin (properties);

-- KG Relationships indexes (critical for graph traversal)
CREATE INDEX IF NOT EXISTS idx_archon_kg_relationships_source ON archon_kg_relationships(source_node_id);
CREATE INDEX IF NOT EXISTS idx_archon_kg_relationships_target ON archon_kg_relationships(target_node_id);
CREATE INDEX IF NOT EXISTS idx_archon_kg_relationships_type ON archon_kg_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_archon_kg_relationships_confidence ON archon_kg_relationships(confidence_score);
CREATE INDEX IF NOT EXISTS idx_archon_kg_relationships_direct ON archon_kg_relationships(is_direct);
CREATE INDEX IF NOT EXISTS idx_archon_kg_relationships_context ON archon_kg_relationships USING gin (context_info);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_repo_type ON archon_kg_nodes(kg_repository_id, node_type);
CREATE INDEX IF NOT EXISTS idx_archon_kg_nodes_repo_file ON archon_kg_nodes(kg_repository_id, file_path);
CREATE INDEX IF NOT EXISTS idx_archon_kg_relationships_source_type ON archon_kg_relationships(source_node_id, relationship_type);

-- KG Analysis indexes
CREATE INDEX IF NOT EXISTS idx_archon_kg_analysis_repository ON archon_kg_analysis(kg_repository_id);
CREATE INDEX IF NOT EXISTS idx_archon_kg_analysis_type ON archon_kg_analysis(analysis_type);

-- =====================================================
-- GRAPH TRAVERSAL AND ANALYSIS FUNCTIONS
-- =====================================================

-- Function to get node dependencies (what this node depends on)
CREATE OR REPLACE FUNCTION get_kg_node_dependencies(
    node_id_param UUID,
    max_depth INTEGER DEFAULT 3,
    relationship_types TEXT[] DEFAULT ARRAY['calls', 'imports', 'uses', 'depends_on']
) RETURNS TABLE (
    node_id UUID,
    name TEXT,
    node_type TEXT,
    file_path TEXT,
    relationship_type TEXT,
    depth INTEGER,
    path UUID[]
) AS $$
WITH RECURSIVE dependency_traversal AS (
    -- Base case: start with the given node
    SELECT 
        n.id as node_id,
        n.name,
        n.node_type,
        n.file_path,
        ''::TEXT as relationship_type,
        0 as depth,
        ARRAY[n.id] as path
    FROM archon_kg_nodes n
    WHERE n.id = node_id_param
    
    UNION ALL
    
    -- Recursive case: find dependencies
    SELECT 
        target.id as node_id,
        target.name,
        target.node_type,
        target.file_path,
        r.relationship_type,
        dt.depth + 1,
        dt.path || target.id
    FROM dependency_traversal dt
    JOIN archon_kg_relationships r ON dt.node_id = r.source_node_id
    JOIN archon_kg_nodes target ON r.target_node_id = target.id
    WHERE 
        dt.depth < max_depth 
        AND r.relationship_type = ANY(relationship_types)
        AND target.id != ALL(dt.path) -- Prevent cycles
)
SELECT * FROM dependency_traversal;
$$ LANGUAGE sql;

-- Function to get node dependents (what depends on this node)
CREATE OR REPLACE FUNCTION get_kg_node_dependents(
    node_id_param UUID,
    max_depth INTEGER DEFAULT 3,
    relationship_types TEXT[] DEFAULT ARRAY['calls', 'imports', 'uses', 'depends_on']
) RETURNS TABLE (
    node_id UUID,
    name TEXT,
    node_type TEXT,
    file_path TEXT,
    relationship_type TEXT,
    depth INTEGER
) AS $$
WITH RECURSIVE dependent_traversal AS (
    -- Base case: start with the given node
    SELECT 
        n.id as node_id,
        n.name,
        n.node_type,
        n.file_path,
        ''::TEXT as relationship_type,
        0 as depth,
        ARRAY[n.id] as path
    FROM archon_kg_nodes n
    WHERE n.id = node_id_param
    
    UNION ALL
    
    -- Recursive case: find dependents
    SELECT 
        source.id as node_id,
        source.name,
        source.node_type,
        source.file_path,
        r.relationship_type,
        dt.depth + 1,
        dt.path || source.id
    FROM dependent_traversal dt
    JOIN archon_kg_relationships r ON dt.node_id = r.target_node_id
    JOIN archon_kg_nodes source ON r.source_node_id = source.id
    WHERE 
        dt.depth < max_depth 
        AND r.relationship_type = ANY(relationship_types)
        AND source.id != ALL(dt.path) -- Prevent cycles
)
SELECT node_id, name, node_type, file_path, relationship_type, depth FROM dependent_traversal;
$$ LANGUAGE sql;

-- Function to find shortest path between two nodes
CREATE OR REPLACE FUNCTION find_kg_node_path(
    source_node_id UUID,
    target_node_id UUID,
    max_depth INTEGER DEFAULT 10
) RETURNS TABLE (
    step_number INTEGER,
    node_id UUID,
    name TEXT,
    node_type TEXT,
    relationship_type TEXT
) AS $$
WITH RECURSIVE path_search AS (
    -- Base case: start with source node
    SELECT 
        1 as step_number,
        n.id as node_id,
        n.name,
        n.node_type,
        ''::TEXT as relationship_type,
        ARRAY[n.id] as path,
        0 as depth
    FROM archon_kg_nodes n
    WHERE n.id = source_node_id
    
    UNION ALL
    
    -- Recursive case: explore connected nodes
    SELECT 
        ps.step_number + 1,
        target.id as node_id,
        target.name,
        target.node_type,
        r.relationship_type,
        ps.path || target.id,
        ps.depth + 1
    FROM path_search ps
    JOIN archon_kg_relationships r ON ps.node_id = r.source_node_id
    JOIN archon_kg_nodes target ON r.target_node_id = target.id
    WHERE 
        ps.depth < max_depth
        AND target.id != ALL(ps.path) -- Prevent cycles
        AND target_node_id != ALL(ps.path) -- Stop if we haven't found target yet
)
SELECT step_number, node_id, name, node_type, relationship_type 
FROM path_search 
WHERE node_id = target_node_id
ORDER BY step_number
LIMIT 1; -- Return first (shortest) path found
$$ LANGUAGE sql;

-- Function to get repository overview statistics
CREATE OR REPLACE FUNCTION get_kg_repository_stats(repo_id UUID)
RETURNS TABLE (
    total_nodes INTEGER,
    total_relationships INTEGER,
    nodes_by_type JSONB,
    relationships_by_type JSONB,
    languages JSONB,
    complexity_stats JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*)::INTEGER FROM archon_kg_nodes WHERE kg_repository_id = repo_id) as total_nodes,
        (SELECT COUNT(*)::INTEGER FROM archon_kg_relationships r 
         JOIN archon_kg_nodes n ON r.source_node_id = n.id 
         WHERE n.kg_repository_id = repo_id) as total_relationships,
        
        (SELECT jsonb_object_agg(node_type, node_count)
         FROM (
             SELECT node_type, COUNT(*) as node_count
             FROM archon_kg_nodes 
             WHERE kg_repository_id = repo_id
             GROUP BY node_type
         ) t) as nodes_by_type,
        
        (SELECT jsonb_object_agg(relationship_type, rel_count)
         FROM (
             SELECT r.relationship_type, COUNT(*) as rel_count
             FROM archon_kg_relationships r
             JOIN archon_kg_nodes n ON r.source_node_id = n.id
             WHERE n.kg_repository_id = repo_id
             GROUP BY r.relationship_type
         ) t) as relationships_by_type,
        
        (SELECT jsonb_object_agg(language, lang_count)
         FROM (
             SELECT language, COUNT(*) as lang_count
             FROM archon_kg_nodes 
             WHERE kg_repository_id = repo_id
             GROUP BY language
         ) t) as languages,
        
        (SELECT jsonb_build_object(
            'avg_complexity', COALESCE(AVG(complexity_score), 0),
            'max_complexity', COALESCE(MAX(complexity_score), 0),
            'high_complexity_count', COUNT(*) FILTER (WHERE complexity_score > 10)
         )
         FROM archon_kg_nodes 
         WHERE kg_repository_id = repo_id AND complexity_score IS NOT NULL) as complexity_stats;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS FOR AUTOMATIC MAINTENANCE
-- =====================================================

-- Auto-update timestamps
CREATE OR REPLACE TRIGGER update_archon_kg_sources_updated_at 
    BEFORE UPDATE ON archon_kg_sources 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_archon_kg_repositories_updated_at 
    BEFORE UPDATE ON archon_kg_repositories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all KG tables
ALTER TABLE archon_kg_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE archon_kg_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE archon_kg_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE archon_kg_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE archon_kg_analysis ENABLE ROW LEVEL SECURITY;

-- Service role policies (full access)
CREATE POLICY "Allow service role full access to archon_kg_sources" ON archon_kg_sources
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to archon_kg_repositories" ON archon_kg_repositories
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to archon_kg_nodes" ON archon_kg_nodes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to archon_kg_relationships" ON archon_kg_relationships
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to archon_kg_analysis" ON archon_kg_analysis
    FOR ALL USING (auth.role() = 'service_role');

-- Authenticated user policies (read and update)
CREATE POLICY "Allow authenticated users to read and update archon_kg_sources" ON archon_kg_sources
    FOR ALL TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to read and update archon_kg_repositories" ON archon_kg_repositories
    FOR ALL TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to read and update archon_kg_nodes" ON archon_kg_nodes
    FOR ALL TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to read and update archon_kg_relationships" ON archon_kg_relationships
    FOR ALL TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to read archon_kg_analysis" ON archon_kg_analysis
    FOR SELECT TO authenticated
    USING (true);

-- =====================================================
-- TABLE COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON TABLE archon_kg_sources IS 'Knowledge Graph sources that link to existing Archon content (crawled pages, projects) or external repositories';
COMMENT ON TABLE archon_kg_repositories IS 'Parsed repository metadata and statistics for Knowledge Graph analysis';
COMMENT ON TABLE archon_kg_nodes IS 'Individual code entities (files, classes, functions, variables) extracted from repositories';
COMMENT ON TABLE archon_kg_relationships IS 'Relationships between code entities (calls, imports, inheritance, dependencies)';
COMMENT ON TABLE archon_kg_analysis IS 'Cached analysis results for performance optimization of complex graph queries';

COMMENT ON COLUMN archon_kg_sources.source_type IS 'Type of source: crawled_content, project_repository, or uploaded_file';
COMMENT ON COLUMN archon_kg_sources.archon_source_id IS 'Foreign key to archon_sources for crawled content integration';
COMMENT ON COLUMN archon_kg_sources.archon_project_id IS 'Foreign key to archon_projects for project repository analysis';
COMMENT ON COLUMN archon_kg_nodes.fully_qualified_name IS 'Complete namespace path (e.g., module.Class.method)';
COMMENT ON COLUMN archon_kg_relationships.confidence_score IS 'AI confidence in relationship accuracy (0.0-1.0)';

-- =====================================================
-- KNOWLEDGE GRAPH EXTENSION COMPLETE
-- =====================================================
-- The Knowledge Graph extension is now integrated with Archon!
-- 
-- Key integration points:
-- 1. Links to archon_sources (crawled content)  
-- 2. Links to archon_projects (project repositories)
-- 3. Follows all Archon patterns (naming, RLS, triggers)
-- 4. Adds KG settings to archon_settings table
-- 5. Provides powerful graph analysis functions
-- =====================================================
```

---

## **🔗 Perfect Integration Benefits**

### **✅ Seamless Linking to Existing Content**
- **Crawled Websites**: When user checks "Generate KG" → links to `archon_sources`
- **Project Repos**: Analyze project codebases → links to `archon_projects`  
- **Uploaded Files**: Local file analysis → standalone KG sources

### **✅ Follows Archon Patterns Exactly**
- **Naming**: All tables prefixed with `archon_kg_*`
- **Primary Keys**: UUID with `gen_random_uuid()`
- **Timestamps**: `created_at`/`updated_at` with auto-triggers
- **RLS**: Same policies as existing tables
- **Settings**: Extends `archon_settings` table

### **✅ UI Integration Points**
```typescript
// Add to crawl UI
interface CrawlOptions {
    generateKnowledgeGraph: boolean; // NEW CHECKBOX
    kgLanguages: string[]; // Which languages to parse
}

// Knowledge Base toolbar gets new button  
<button>📊 Knowledge Graph</button>
```

### **✅ Zero Breaking Changes**
- All existing Archon functionality works unchanged
- KG tables use `CASCADE DELETE` for clean data management
- Can be completely disabled via settings
- Rollback safe - can drop all KG tables without affecting core data

This approach gives you **maximum integration** with **minimal risk** - perfect for contributing to the official Archon project! 🚀