# **🧠 Archon Knowledge Graph Feature Implementation Plan**

This document outlines the implementation plan for adding knowledge graph functionality to Archon, enabling universal code parsing and relationship visualization for any codebase.

---

## **1. 🔑 Golden Rules**

Following the established Archon development principles:

* **Keep UI style consistent** - Maintain existing Archon design language with glow effects and dark theme
* **Use Tree-sitter for universal parsing** - No custom parsers, leverage proven technology
* **Supabase-first architecture** - Store graph data in Supabase using PostgreSQL with pgRouting
* **Minimal, focused implementation** - Only add essential features, avoid feature creep
* **Follow existing patterns** - Mirror mcp-crawl4ai-rag knowledge graph tools structure
* **Test incrementally** - Each component should be testable in isolation
* **Clean modular code** - Keep files under 500 lines, clear separation of concerns

---

## **2. 🧠 Planning & Architecture**

### **Core Vision**
Add a "Knowledge Graph" button to Archon's knowledge base UI that allows users to:
- Parse any codebase using Tree-sitter universal parsing
- Generate interactive knowledge graphs showing code relationships
- Query the graph for code understanding and navigation
- Visualize dependencies, classes, functions, and their connections

### **Technical Stack**
- **Frontend**: React with existing Archon UI components + glow effects
- **Parsing**: Tree-sitter with `tree-sitter-languages` Python package
- **Visualization**: D3.js or Cytoscape.js for interactive graph rendering
- **Database**: Supabase PostgreSQL with pgRouting extension
- **Backend**: Python FastAPI service for parsing and graph generation
- **Integration**: Follow mcp-crawl4ai-rag patterns for consistency

### **Integration with Existing Archon Architecture**

Based on Archon's current microservices structure, we'll integrate into the existing FastAPI Server (Port 8181):

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Frontend UI     │ │ Server (API)    │ │ MCP Server      │ │ Agents Service  │
│                 │ │                 │ │                 │ │                 │
│ React + Vite    │◄►│ FastAPI +       │◄►│ Lightweight     │◄►│ PydanticAI     │
│ Port 3737       │ │ SocketIO        │ │ HTTP Wrapper    │ │ Port 8052       │
│                 │ │ Port 8181       │ │ Port 8051       │ │                 │
│ + KG Viewer     │ │ + KG Endpoints  │ │ + KG Tools      │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
                                │
                                ▼
                    ┌─────────────────┐
                    │ Database        │
                    │                 │
                    │ Supabase        │
                    │ PostgreSQL      │
                    │ PGVector        │
                    │ + KG Tables     │
                    └─────────────────┘
```

**Integration Points:**
- **Frontend**: Add KG viewer to existing React UI (Port 3737)
- **API**: Extend existing FastAPI server with KG endpoints (Port 8181)  
- **MCP**: Add KG tools to existing MCP server (Port 8051)
- **Database**: Add KG tables to existing Supabase setup

### **Database Schema** (Supabase)
```sql
-- Repositories table
CREATE TABLE kg_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT,
  language TEXT NOT NULL,
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nodes table (classes, functions, variables, etc.)
CREATE TABLE kg_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID REFERENCES kg_repositories(id),
  type TEXT NOT NULL, -- 'class', 'function', 'variable', 'import'
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationships table
CREATE TABLE kg_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES kg_nodes(id),
  target_id UUID REFERENCES kg_nodes(id),
  relationship_type TEXT NOT NULL, -- 'calls', 'inherits', 'imports', 'uses'
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## **3. ⚙️ Implementation Tasks**

### **Phase 1: Database Integration** 
- [ ] Extend `migration/complete_setup.sql` with KG schema
- [ ] Add KG settings to existing `archon_settings` table
- [ ] Test database migration on clean Supabase instance
- [ ] Verify foreign key relationships to existing tables
- [ ] Add KG configuration to existing settings UI

### **Phase 2: Backend Parser Service**
- [ ] Create `python/src/knowledge_graph/` module in existing codebase
- [ ] Add `tree-sitter-languages` to existing requirements
- [ ] Build Tree-sitter universal parser with multi-language support
- [ ] Implement AST traversal and entity extraction
- [ ] Add relationship detection (calls, inheritance, imports)
- [ ] Write unit tests for parser functionality

### **Phase 3: API Integration**
- [ ] Extend existing FastAPI server (`python/src/server.py`) with KG endpoints
- [ ] Add KG routes: `/api/knowledge-graph/*`
- [ ] Implement graph traversal using existing Supabase client
- [ ] Add KG tools to existing MCP server (Port 8051)
- [ ] Follow existing Archon API patterns and authentication

### **Phase 4: Frontend Integration**
- [ ] Add "Generate KG ☑️" checkbox to existing crawl UI
- [ ] Add "Knowledge Graph" button to knowledge base toolbar
- [ ] Create React KG viewer component with Archon styling
- [ ] Implement graph visualization (D3.js/Cytoscape.js)
- [ ] Apply existing glow effects and dark theme
- [ ] Integrate with existing routing and state management

---

## **4. 🧰 File Structure (Integration with Existing Archon)**

**Backend Integration** (Add to existing Python structure):
```
python/
├── src/
│   ├── knowledge_graph/           # NEW MODULE
│   │   ├── __init__.py
│   │   ├── parser.py              # Tree-sitter universal parser  
│   │   ├── graph_builder.py       # Graph construction logic
│   │   ├── models.py              # Pydantic models
│   │   └── routes.py              # FastAPI endpoints
│   ├── database/
│   │   └── kg_schema.sql          # NEW: KG table definitions
│   └── server.py                  # UPDATE: Add KG routes
```

**Frontend Integration** (Add to existing React structure):
```
archon-ui-main/
├── src/
│   ├── components/
│   │   ├── KnowledgeGraph/        # NEW COMPONENT
│   │   │   ├── GraphViewer.tsx    # Main graph component
│   │   │   ├── GraphControls.tsx  # Filters and search  
│   │   │   └── GraphViewer.css    # Archon-styled effects
│   │   └── KnowledgeBase/         # UPDATE EXISTING
│   │       └── KnowledgeBase.tsx  # Add KG button
│   └── hooks/
│       └── useKnowledgeGraph.ts   # NEW: React hooks for graph data
```

**MCP Integration** (Add to existing MCP structure):
```
python/
├── src/
│   └── mcp_server/
│       └── tools/
│           └── knowledge_graph.py # NEW: KG MCP tools
```

---

## **5. 💬 Key Technical Decisions**

### **Why Tree-sitter?**
- Universal parsing for 50+ languages
- Battle-tested (powers GitHub, Atom)
- No need to build/maintain custom parsers
- Perfect Python integration with `tree-sitter-languages`

### **Why Supabase + pgRouting?**
- Already integrated in Archon
- PostgreSQL provides robust graph capabilities
- pgRouting offers efficient path finding
- No additional infrastructure needed

### **Why D3.js/Cytoscape.js?**
- Mature graph visualization libraries
- Highly customizable for Archon's glow effects
- Good performance with large graphs
- React integration available

### **Integration Pattern**
Follow mcp-crawl4ai-rag structure:
- Similar tool naming conventions
- Consistent error handling patterns
- Same configuration approach
- Mirror the knowledge graph validation logic

---

## **6. 🧩 Development Approach**

### **Start Small, Iterate Fast**
1. **MVP**: Single language (Python), basic visualization
2. **Expand**: Add more languages via Tree-sitter
3. **Enhance**: Advanced queries, filtering, export
4. **Polish**: Performance optimization, UX improvements

### **Integration Points**
- Leverage existing Archon crawling infrastructure
- Use existing UI components and styling
- Integrate with current project/repository management
- Follow established authentication patterns

### **Testing Strategy**
- Unit tests for each parser component
- Integration tests for API endpoints
- Frontend component testing
- End-to-end testing with sample repositories

---

## **7. ✅ Success Metrics**

- [ ] Parse any supported language codebase in <30 seconds
- [ ] Generate interactive graphs with Archon's visual style
- [ ] Support 20+ programming languages via Tree-sitter
- [ ] Handle repositories up to 10k files efficiently
- [ ] Maintain <500 lines per code file
- [ ] Zero breaking changes to existing Archon functionality
- [ ] Comprehensive test coverage (>90%)

---

## **8. 🚀 Future Enhancements**

*Not part of MVP but potential future additions:*
- AI-powered code analysis using the graph
- Integration with Archon's AI agents
- Real-time collaboration on graph exploration
- Advanced filtering and search capabilities
- Graph-based code recommendations
- Performance profiling integration

---

**Implementation Priority**: HIGH
**Estimated Timeline**: 2 weeks for MVP (reduced from 3 weeks)
**Risk Level**: VERY LOW (leveraging existing Archon infrastructure)