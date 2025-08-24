export interface GraphNode {
  id: string;
  name: string;
  type: 'function' | 'class' | 'variable' | 'import' | 'module' | 'file' | 'repository' | 'interface' | 'method';
  language: string;
  filePath: string;
  lineNumber?: number;
  size: number;
  color: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  // Hierarchical properties for Neo4j-style expansion
  level?: number;
  parentId?: string;
  childrenIds?: string[];
  isExpanded?: boolean;
  isExpandable?: boolean;
  childrenLoaded?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'calls' | 'imports' | 'inherits' | 'references' | 'contains';
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphLayout {
  name: string;
  displayName: string;
  description: string;
  supportsAnimation: boolean;
  supportsHierarchy: boolean;
}

export const AVAILABLE_LAYOUTS: GraphLayout[] = [
  {
    name: 'cola',
    displayName: 'Force Layout',
    description: 'Physics-based layout with collision detection',
    supportsAnimation: true,
    supportsHierarchy: false
  },
  {
    name: 'dagre',
    displayName: 'Hierarchical',
    description: 'Top-down hierarchical layout',
    supportsAnimation: true,
    supportsHierarchy: true
  },
  {
    name: 'cose',
    displayName: 'Compound Spring',
    description: 'Spring embedder layout with compound nodes',
    supportsAnimation: true,
    supportsHierarchy: true
  },
  {
    name: 'circle',
    displayName: 'Circular',
    description: 'Nodes arranged in a circle',
    supportsAnimation: true,
    supportsHierarchy: false
  },
  {
    name: 'grid',
    displayName: 'Grid',
    description: 'Nodes arranged in a grid pattern',
    supportsAnimation: true,
    supportsHierarchy: false
  }
];

export interface GraphEngine {
  name: string;
  displayName: string;
  description: string;
  features: string[];
  performanceLevel: 'low' | 'medium' | 'high';
}

export const AVAILABLE_ENGINES: GraphEngine[] = [
  {
    name: 'd3',
    displayName: 'D3.js Force',
    description: 'Custom D3.js implementation with advanced physics',
    features: ['Real-time simulation', 'Custom styling', 'Interactive forces'],
    performanceLevel: 'high'
  },
  {
    name: 'cytoscape',
    displayName: 'Cytoscape.js',
    description: 'Professional graph visualization library',
    features: ['Multiple layouts', 'Advanced styling', 'Excellent performance'],
    performanceLevel: 'high'
  }
];