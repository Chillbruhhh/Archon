import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '../ui/Badge';
import { RepositoryInfo } from '../../services/knowledgeGraphService';
import { D3GraphEngine } from './graph-engines/D3GraphEngine';
import { GraphNode, GraphEdge, GraphData } from './types';
import { 
  Settings, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Layers,
  X,
  Home,
  ChevronUp,
  ChevronDown,
  Search,
  Filter,
  ArrowRight,
  Target
} from 'lucide-react';

interface KnowledgeGraphVisualizationProps {
  repository: RepositoryInfo;
  onNodeSelect: (node: GraphNode) => void;
}

export const KnowledgeGraphVisualization: React.FC<KnowledgeGraphVisualizationProps> = ({
  repository,
  onNodeSelect
}) => {
  // State management
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [allNodesData, setAllNodesData] = useState<GraphData>({ nodes: [], edges: [] }); // Full dataset for instant filtering
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  
  // Neo4j-style hierarchy control state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(true);
  const [hierarchyLevel, setHierarchyLevel] = useState(0);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [navigationPath, setNavigationPath] = useState<string[]>([]);
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });
  
  // Phase 6: Enhanced navigation and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNodeType, setFilteredNodeType] = useState<string>('all');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [breadcrumbNodes, setBreadcrumbNodes] = useState<GraphNode[]>([]);
  const [keyboardNavigationEnabled, setKeyboardNavigationEnabled] = useState(false);
  const [expandAllInProgress, setExpandAllInProgress] = useState(false);
  const [nodeExpansionInProgress, setNodeExpansionInProgress] = useState<Set<string>>(new Set());
  
  // Ref for container element
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Helper function to get node colors based on type and language
  const getNodeColor = (type: string, language: string): string => {
    // Color by node type first
    const typeColors: Record<string, string> = {
      'file': '#6b7280',      // gray
      'class': '#10b981',     // green
      'function': '#f59e0b',  // orange
      'method': '#f59e0b',    // orange
      'variable': '#8b5cf6',  // purple
      'import': '#3b82f6',    // blue
      'interface': '#06b6d4', // cyan
      'enum': '#ec4899',      // pink
      'module': '#14b8a6',    // teal
      'namespace': '#84cc16'  // lime
    };

    // Language accent colors
    const languageAccents: Record<string, string> = {
      'python': '#3776ab',
      'javascript': '#f7df1e',
      'typescript': '#3178c6',
      'java': '#ed8b00',
      'cpp': '#00599c',
      'c': '#555555',
      'rust': '#000000',
      'go': '#00add8',
      'ruby': '#cc342d',
      'php': '#777bb4'
    };

    return typeColors[type] || languageAccents[language] || '#6b7280';
  };

  const loadGraphData = useCallback(async () => {
    try {
      setLoading(true);
      
      console.log(`🔍 Loading hierarchical graph data for repository: ${repository.id}`);
      
      // Import the knowledge graph service
      const { knowledgeGraphService } = await import('../../services/knowledgeGraphService');
      
      console.log(`🔍 loadGraphData called with:`, {
        hierarchyLevel,
        expandedNodesSize: expandedNodes.size,
        expandedNodeIds: Array.from(expandedNodes),
        repositoryId: repository.id
      });

      // CRITICAL FIX: Always load complete data from API - no early return!
      console.log(`📊 Loading complete graph data from API for repository: ${repository.name}...`);
      
      // Get comprehensive graph data from API
      const graphResponse = await knowledgeGraphService.queryGraph({
        repository_id: repository.id,
        max_depth: 10, // Get deeper hierarchy
        node_types: ['file', 'module', 'class', 'function', 'method', 'variable'], // All node types
        relationship_types: ['contains', 'calls', 'imports', 'inherits', 'uses', 'defines'],
        include_properties: true
      });

      if (!graphResponse.success) {
        console.error('❌ API call failed:', graphResponse.error);
        throw new Error(graphResponse.error || 'Failed to load graph data');
      }
      
      console.log(`✅ API call successful: loaded ${graphResponse.data?.nodes?.length || 0} nodes and ${graphResponse.data?.relationships?.length || 0} relationships`);

      console.log(`📊 API Response:`, graphResponse.data);

      // Convert API data to hierarchical format with real relationships
      const apiNodes = graphResponse.data.nodes;
      const apiRelationships = graphResponse.data.relationships;

      // Build node hierarchy from real data
      const nodeMap = new Map<string, GraphNode>();
      const parentChildMap = new Map<string, string[]>(); // parent -> children

      // First pass: Create all nodes
      apiNodes.forEach(apiNode => {
        const hierarchicalNode: GraphNode = {
          id: apiNode.id,
          name: apiNode.name,
          type: mapApiNodeType(apiNode.node_type),
          language: apiNode.language,
          filePath: apiNode.file_path,
          lineNumber: apiNode.line_start,
          size: getHierarchicalNodeSize(mapApiNodeType(apiNode.node_type)),
          color: getHierarchicalNodeColor(mapApiNodeType(apiNode.node_type), apiNode.language),
          level: determineNodeLevelFromPath(apiNode.file_path, apiNode.node_type),
          parentId: undefined, // Will be set in second pass
          childrenIds: [],
          isExpanded: expandedNodes.has(apiNode.id),
          isExpandable: false, // Will be set based on actual children after relationship building
          childrenLoaded: true // Real data is loaded
        };
        nodeMap.set(apiNode.id, hierarchicalNode);
      });

      // Second pass: Build parent-child relationships from API relationships
      console.log(`🔗 Building parent-child relationships from ${apiRelationships.length} API relationships...`);
      
      apiRelationships.forEach(rel => {
        if (rel.relationship_type === 'contains') {
          const parentNode = nodeMap.get(rel.source_node_id);
          const childNode = nodeMap.get(rel.target_node_id);
          
          if (parentNode && childNode) {
            // Set parent relationship
            childNode.parentId = parentNode.id;
            
            // Add to parent's children
            if (!parentNode.childrenIds) parentNode.childrenIds = [];
            if (!parentNode.childrenIds.includes(childNode.id)) {
              parentNode.childrenIds.push(childNode.id);
            }
            
            // Track in parent-child map
            if (!parentChildMap.has(parentNode.id)) {
              parentChildMap.set(parentNode.id, []);
            }
            if (!parentChildMap.get(parentNode.id)!.includes(childNode.id)) {
              parentChildMap.get(parentNode.id)!.push(childNode.id);
            }
            
            console.log(`🔗 Linked: ${parentNode.name} (${parentNode.type}) -> ${childNode.name} (${childNode.type})`);
          } else {
            console.log(`⚠️ Relationship missing nodes: source=${rel.source_node_id} (${!!parentNode}), target=${rel.target_node_id} (${!!childNode})`);
          }
        }
      });
      
      // DEBUG: Log final parent-child relationships
      console.log(`📊 Final parent-child relationships:`, 
        Array.from(parentChildMap.entries()).map(([parentId, childIds]) => {
          const parentNode = nodeMap.get(parentId);
          const childNames = childIds.map(childId => nodeMap.get(childId)?.name || childId).slice(0, 3);
          return `${parentNode?.name} (${parentNode?.type}): ${childIds.length} children [${childNames.join(', ')}${childIds.length > 3 ? '...' : ''}]`;
        })
      );

      
      // Third pass: Update isExpandable based on actual children
      console.log(`🎯 Setting isExpandable flags based on actual children...`);
      nodeMap.forEach((node, nodeId) => {
        const hasChildren = node.childrenIds && node.childrenIds.length > 0;
        const isExpandableType = determineIfExpandableFromApi(node.type);
        
        // Node is expandable if it has children OR if it's a type that typically contains children
        node.isExpandable = hasChildren || isExpandableType;
        
        console.log(`${hasChildren ? '✅' : '❌'} ${node.name} (${node.type}): ${node.childrenIds?.length || 0} children, expandable: ${node.isExpandable}`);
      });

      // Fourth pass: Create hierarchical structure starting from repository root
      const allNodes: GraphNode[] = [];
      const allEdges: GraphEdge[] = [];

      // Always include the repository root
      const topLevelNodeIds = findTopLevelNodes(nodeMap, apiRelationships);
      console.log(`🏠 CRITICAL DEBUG: Repository root children found:`, {
        topLevelCount: topLevelNodeIds.length,
        topLevelNodeIds: topLevelNodeIds,
        topLevelNames: topLevelNodeIds.map(id => {
          const node = nodeMap.get(id);
          return `${node?.name || id} (${node?.type || 'unknown'})`;
        })
      });
      
      const rootNode: GraphNode = {
        id: `repo-${repository.id}`,
        name: repository.name,
        type: 'repository',
        language: repository.primary_language || 'unknown',
        filePath: '/',
        lineNumber: undefined,
        size: 60,
        color: '#00d4ff',
        level: 0,
        parentId: undefined,
        childrenIds: topLevelNodeIds,
        isExpanded: expandedNodes.has(`repo-${repository.id}`),
        isExpandable: true,
        childrenLoaded: true
      };
      allNodes.push(rootNode);
      
      console.log(`🏠 CRITICAL DEBUG: Repository root created:`, {
        id: rootNode.id,
        name: rootNode.name,
        childrenCount: rootNode.childrenIds.length,
        isExpanded: rootNode.isExpanded,
        isExpandable: rootNode.isExpandable
      });

      // Add all real nodes from API
      nodeMap.forEach(node => allNodes.push(node));

      // Fifth pass: Create edges from API relationships
      apiRelationships.forEach(rel => {
        const edge: GraphEdge = {
          id: rel.id,
          source: rel.source_node_id,
          target: rel.target_node_id,
          type: mapApiRelationshipType(rel.relationship_type),
          weight: rel.confidence_score || 1
        };
        allEdges.push(edge);
      });

      // Add edges from repository root to top-level nodes AND set parent relationships
      console.log(`🔗 Adding ${topLevelNodeIds.length} edges from repository root to top-level nodes`);
      
      // DEBUG: Log repository root setup (now that topLevelNodeIds is defined)
      console.log(`🏠 Repository root setup:`, {
        id: `repo-${repository.id}`,
        name: repository.name,
        childrenCount: topLevelNodeIds.length,
        topLevelChildren: topLevelNodeIds.map(id => nodeMap.get(id)?.name || id).slice(0, 5)
      });
      
      topLevelNodeIds.forEach(nodeId => {
        // Create edge from repository to top-level node
        const edge = {
          id: `repo-edge-${nodeId}`,
          source: `repo-${repository.id}`,
          target: nodeId,
          type: 'contains' as const,
          weight: 1
        };
        allEdges.push(edge);
        
        // CRITICAL FIX: Set parentId on top-level nodes to link them to repository root
        const topLevelNode = nodeMap.get(nodeId);
        if (topLevelNode) {
          topLevelNode.parentId = `repo-${repository.id}`;
          console.log(`🔗 Linked ${topLevelNode.name} (${topLevelNode.type}) to repository as parent`);
        }
        
        console.log(`🔗 Added repository edge: ${repository.name} -> ${nodeMap.get(nodeId)?.name}`);
      });

      // Filter to show only relevant nodes based on current expansion state
      const visibleNodes = filterNodesForCurrentHierarchy(allNodes);
      const visibleEdges = filterEdgesForVisibleNodes(allEdges, visibleNodes);

      // Store complete dataset for instant client-side filtering
      setAllNodesData({ nodes: allNodes, edges: allEdges });
      
      // Set visible nodes for initial display
      setGraphData({ nodes: visibleNodes, edges: visibleEdges });
      
      console.log(`✅ Successfully loaded ${visibleNodes.length} visible nodes and ${visibleEdges.length} edges from real API data`);
      
    } catch (error) {
      console.error('❌ Failed to load graph data:', error);
      
      // Fallback to root node only
      const rootNode: GraphNode = {
        id: `repo-${repository.id}`,
        name: repository.name,
        type: 'repository',
        language: repository.primary_language || 'unknown',
        filePath: '/',
        lineNumber: undefined,
        size: 60,
        color: '#00d4ff',
        level: 0,
        parentId: undefined,
        childrenIds: [],
        isExpanded: false,
        isExpandable: true,
        childrenLoaded: false
      };
      
      setGraphData({ nodes: [rootNode], edges: [] });
      setBreadcrumbNodes([rootNode]);
    } finally {
      setLoading(false);
    }
  }, [repository.id]); // INSTANT EXPANSION: Remove hierarchyLevel and expandedNodes from deps to prevent reloads

  // Helper functions for API data mapping
  const mapApiNodeType = (apiType: string): string => {
    // Map API node types to our UI types
    const typeMapping: Record<string, string> = {
      'FILE': 'file',
      'MODULE': 'module', 
      'CLASS': 'class',
      'FUNCTION': 'function',
      'METHOD': 'method',
      'VARIABLE': 'variable',
      'INTERFACE': 'interface',
      'ENUM': 'enum',
      'NAMESPACE': 'namespace'
    };
    return typeMapping[apiType.toUpperCase()] || apiType.toLowerCase();
  };

  const mapApiRelationshipType = (apiType: string): 'calls' | 'imports' | 'inherits' | 'uses' | 'contains' => {
    // Map API relationship types to our UI types (excluding unsupported 'references')
    const relationshipMapping: Record<string, 'calls' | 'imports' | 'inherits' | 'uses' | 'contains'> = {
      'CALLS': 'calls',
      'IMPORTS': 'imports', 
      'INHERITS': 'inherits',
      'USES': 'uses',
      'DEFINES': 'uses', // Map 'defines' to 'uses' for UI consistency
      'CONTAINS': 'contains'
    };
    return relationshipMapping[apiType.toUpperCase()] || 'uses';
  };

  const determineNodeLevelFromPath = (filePath: string, nodeType: string): number => {
    // Determine hierarchy level based on file path and node type
    if (nodeType.toLowerCase() === 'file') {
      // File level based on directory depth
      const pathParts = filePath.split('/').filter(part => part.length > 0);
      return Math.min(pathParts.length, 3); // Cap at level 3 for files
    }
    
    // Code entity levels
    const nodeTypeToLevel: Record<string, number> = {
      'module': 1,
      'file': 2,
      'class': 3,
      'interface': 3,
      'function': 4,
      'method': 4,
      'variable': 5,
      'enum': 3
    };
    
    return nodeTypeToLevel[nodeType.toLowerCase()] || 5;
  };

  const determineIfExpandableFromApi = (apiNodeType: string): boolean => {
    const expandableTypes = ['FILE', 'MODULE', 'CLASS', 'INTERFACE', 'NAMESPACE'];
    return expandableTypes.includes(apiNodeType.toUpperCase());
  };

  const findTopLevelNodes = (nodeMap: Map<string, GraphNode>, relationships: any[]): string[] => {
    console.log(`🔍 Finding top-level nodes from ${nodeMap.size} nodes and ${relationships.length} relationships`);
    
    // Find nodes that don't have a "contains" relationship pointing to them
    // These would be top-level files/modules
    const hasParent = new Set<string>();
    
    relationships.forEach(rel => {
      if (rel.relationship_type === 'contains') {
        hasParent.add(rel.target_node_id);
      }
    });
    
    console.log(`📋 Nodes with parents (${hasParent.size}):`, Array.from(hasParent).slice(0, 5));
    
    const topLevelNodes: string[] = [];
    nodeMap.forEach((node, nodeId) => {
      if (!hasParent.has(nodeId) && (node.type === 'file' || node.type === 'module')) {
        topLevelNodes.push(nodeId);
        console.log(`🏠 Found top-level node: ${node.name} (${node.type})`);
      }
    });
    
    console.log(`✅ Found ${topLevelNodes.length} top-level nodes`);
    return topLevelNodes;
  };

  // INSTANT NEO4J-STYLE FILTERING: Client-side visibility control without server calls
  const filterNodesForCurrentHierarchy = (allNodes: GraphNode[]): GraphNode[] => {
    return filterNodesForCurrentHierarchyWithState(allNodes, expandedNodes);
  };

  // NEO4J FILTERING WITH EXPLICIT STATE: Accepts expandedNodes as parameter to avoid stale closure
  const filterNodesForCurrentHierarchyWithState = (allNodes: GraphNode[], currentExpandedNodes: Set<string>): GraphNode[] => {
    console.log(`🚀 NEO4J CUMULATIVE filterNodesForCurrentHierarchy:`, {
      totalNodes: allNodes.length,
      expandedNodesSize: currentExpandedNodes.size,
      expandedNodeIds: Array.from(currentExpandedNodes)
    });

    const visibleNodeIds = new Set<string>();
    const MAX_VISIBLE_NODES = 100;

    // STEP 1: NEO4J CUMULATIVE LOGIC - Build visible set by walking expansion tree
    // This creates the progressive disclosure pattern where each expansion ADDS to the view
    const addNodeAndChildren = (nodeId: string, depth: number = 0, isInheritedExpansion: boolean = false) => {
      console.log(`🔍 CRITICAL DEBUG addNodeAndChildren: nodeId=${nodeId}, depth=${depth}, inherited=${isInheritedExpansion}`);
      
      if (depth > 10) {
        console.log(`⚠️ Max recursion depth reached for ${nodeId}`);
        return; // Prevent infinite recursion
      }
      
      const node = allNodes.find(n => n.id === nodeId);
      if (!node) {
        console.log(`❌ Node not found: ${nodeId}`);
        return;
      }
      
      // CRITICAL FIX: Always add node to visible set first, then check expansion
      if (!visibleNodeIds.has(nodeId)) {
        visibleNodeIds.add(nodeId);
        console.log(`✅ Added to visible set: ${node.name} (${node.type})`);
      } else {
        console.log(`⏭️ Node already visible: ${node.name} (${node.type})`);
      }
      
      // Check if this node is expanded
      const isManuallyExpanded = currentExpandedNodes.has(nodeId);
      const hasChildren = node.childrenIds && node.childrenIds.length > 0;
      
      console.log(`🔍 EXPANSION DEBUG for ${node.name}:`, {
        nodeId,
        isManuallyExpanded,
        isInheritedExpansion,
        hasChildren,
        childCount: node.childrenIds?.length || 0,
        shouldShowChildren: isManuallyExpanded && !isInheritedExpansion
      });
      
      // CRITICAL FIX: Only show children if this node is manually expanded (not inherited)
      // This prevents auto-expansion of grandchildren when parent is opened
      if (isManuallyExpanded && hasChildren && !isInheritedExpansion) {
        console.log(`🔼 Node ${node.name} is MANUALLY EXPANDED - adding ${node.childrenIds.length} children:`, 
          node.childrenIds.slice(0, 5).map(childId => {
            const child = allNodes.find(n => n.id === childId);
            return `${child?.name || childId} (${child?.type || 'unknown'})`;
          })
        );
        
        // Add direct children and mark them as inherited expansion
        node.childrenIds.forEach(childId => {
          const childNode = allNodes.find(n => n.id === childId);
          if (childNode) {
            // Always add direct child to visible set when parent is manually expanded
            if (!visibleNodeIds.has(childId)) {
              visibleNodeIds.add(childId);
              console.log(`✅ Direct child: Added child to visible set: ${childNode.name} (${childNode.type})`);
            }
            
            // CRITICAL FIX: Children are shown with inherited expansion (can't auto-expand further)
            // Only if a child was ALSO manually expanded, it can show its own children
            const isChildManuallyExpanded = currentExpandedNodes.has(childId);
            if (isChildManuallyExpanded) {
              console.log(`🔼 Child ${childNode.name} is ALSO manually expanded - will recurse as manual expansion`);
              addNodeAndChildren(childId, depth + 1, false); // Not inherited, it's manual
            } else {
              console.log(`📝 Child ${childNode.name} is visible via inheritance - no auto-expansion of grandchildren`);
              // Still recurse but mark as inherited so grandchildren don't show
              addNodeAndChildren(childId, depth + 1, true);
            }
          } else {
            console.log(`❌ Child node not found: ${childId}`);
          }
        });
      } else if (!isManuallyExpanded && hasChildren) {
        console.log(`📝 Node ${node.name} has ${node.childrenIds.length} children but is NOT manually expanded`);
      } else if (isManuallyExpanded && !hasChildren) {
        console.log(`📝 Node ${node.name} is manually expanded but has NO children`);
      } else if (isInheritedExpansion) {
        console.log(`📝 Node ${node.name} is shown via inheritance - no further expansion`);
      } else {
        console.log(`📝 Node ${node.name} has no expansion state`);
      }
    };

    // STEP 2: Start expansion from repository root
    const repoRoot = allNodes.find(n => n.type === 'repository');
    if (repoRoot) {
      console.log(`📍 Starting from repository root: ${repoRoot.name}, isExpanded: ${currentExpandedNodes.has(repoRoot.id)}`);
      // CRITICAL FIX: Repository root starts as manual expansion (not inherited)
      addNodeAndChildren(repoRoot.id, 0, false);
    }
    
    // STEP 3: CRITICAL CONNECTION PRESERVATION - Add parent nodes for structural connectivity
    // This ensures connection lines remain visible by including parent nodes of visible children
    // CRITICAL FIX: Only add parents that should be visible based on expansion state
    const additionalNodesForConnections = new Set<string>();
    
    Array.from(visibleNodeIds).forEach(nodeId => {
      const node = allNodes.find(n => n.id === nodeId);
      if (node?.parentId && !visibleNodeIds.has(node.parentId)) {
        const parentNode = allNodes.find(n => n.id === node.parentId);
        // CRITICAL FIX: Only add parent if it should be visible (either expanded or repository root)
        if (parentNode && (currentExpandedNodes.has(node.parentId) || parentNode.type === 'repository')) {
          additionalNodesForConnections.add(node.parentId);
          console.log(`🔗 Adding parent for connectivity: ${parentNode.name} (${parentNode.type}) -> ${node.name} (${node.type})`);
        } else if (parentNode) {
          console.log(`🔗 SKIP parent: ${parentNode.name} (${parentNode.type}) is collapsed - not adding for connectivity`);
        }
      }
    });
    
    // STEP 3.5: EDGE-BASED CONNECTION PRESERVATION - Ensure both endpoints of important edges are visible
    // This prevents connection lines from becoming detached during expansion
    // CRITICAL FIX: Respect expansion state when preserving connections
    const allEdges = allNodesData?.edges || [];
    console.log(`🔗 EDGE-BASED PRESERVATION: Analyzing ${allEdges.length} edges for connectivity requirements`);
    
    allEdges.forEach(edge => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      
      const sourceInVisible = visibleNodeIds.has(sourceId);
      const targetInVisible = visibleNodeIds.has(targetId);
      
      // CRITICAL FIX: Only preserve structural connections if the parent is expanded
      if ((sourceInVisible || targetInVisible) && (edge.type === 'contains' || sourceId.startsWith('repo-'))) {
        if (sourceInVisible && !targetInVisible) {
          const targetNode = allNodes.find(n => n.id === targetId);
          const sourceNode = allNodes.find(n => n.id === sourceId);
          // Only add if source is expanded (meaning it should show its children)
          if (targetNode && sourceNode && currentExpandedNodes.has(sourceId)) {
            additionalNodesForConnections.add(targetId);
            console.log(`🔗 EDGE PRESERVATION: Adding target node ${targetNode.name} (${targetNode.type}) because source ${sourceNode.name} is expanded`);
          } else if (targetNode && sourceNode) {
            console.log(`🔗 SKIP EDGE: Not adding ${targetNode.name} because source ${sourceNode.name} is collapsed`);
          }
        }
        if (targetInVisible && !sourceInVisible) {
          const sourceNode = allNodes.find(n => n.id === sourceId);
          // Only add source if it's expanded or it's the repository root
          if (sourceNode && (currentExpandedNodes.has(sourceId) || sourceNode.type === 'repository')) {
            additionalNodesForConnections.add(sourceId);
            console.log(`🔗 EDGE PRESERVATION: Adding source node ${sourceNode.name} (${sourceNode.type}) to preserve ${edge.type} connection`);
          } else if (sourceNode) {
            console.log(`🔗 SKIP EDGE: Not adding ${sourceNode.name} because it's collapsed`);
          }
        }
      }
    });
    
    // Add the additional nodes needed for connections
    additionalNodesForConnections.forEach(nodeId => {
      visibleNodeIds.add(nodeId);
    });
    
    console.log(`🔗 CONNECTION PRESERVATION COMPLETE: Added ${additionalNodesForConnections.size} nodes for edge connectivity`);
    
    // STEP 4: Handle any orphaned expanded nodes (safety net)
    // This catches cases where nodes might be expanded but not connected to tree
    Array.from(currentExpandedNodes).forEach(expandedNodeId => {
      if (!visibleNodeIds.has(expandedNodeId)) {
        console.log(`🔍 Found orphaned expanded node: ${expandedNodeId}, adding to visible set`);
        const orphanNode = allNodes.find(n => n.id === expandedNodeId);
        if (orphanNode) {
          visibleNodeIds.add(expandedNodeId);
          
          // Also add its parent chain to make it reachable
          let currentNode = orphanNode;
          while (currentNode?.parentId && !visibleNodeIds.has(currentNode.parentId)) {
            const parentNode = allNodes.find(n => n.id === currentNode.parentId);
            if (parentNode) {
              visibleNodeIds.add(parentNode.id);
              console.log(`🔗 Added parent for visibility: ${parentNode.name} (${parentNode.type})`);
              currentNode = parentNode;
            } else {
              break;
            }
          }
        }
      }
    });
    
    // STEP 5: Apply performance limit if needed
    const visibleNodeIdsArray = Array.from(visibleNodeIds);
    if (visibleNodeIdsArray.length > MAX_VISIBLE_NODES) {
      console.log(`⚡ PERFORMANCE: Limiting ${visibleNodeIdsArray.length} to ${MAX_VISIBLE_NODES} nodes`);
      
      // Prioritize by importance: repository first, then by expansion order, then by level
      const prioritizedNodes = visibleNodeIdsArray
        .map(id => allNodes.find(n => n.id === id))
        .filter(node => node !== undefined)
        .sort((a, b) => {
          // Repository root always first
          if (a!.type === 'repository') return -1;
          if (b!.type === 'repository') return 1;
          
          // Expanded nodes have higher priority
          const aExpanded = currentExpandedNodes.has(a!.id);
          const bExpanded = currentExpandedNodes.has(b!.id);
          if (aExpanded && !bExpanded) return -1;
          if (!aExpanded && bExpanded) return 1;
          
          // Then sort by hierarchy level (lower levels first)
          return (a!.level || 0) - (b!.level || 0);
        })
        .slice(0, MAX_VISIBLE_NODES)
        .map(node => node!.id);
      
      visibleNodeIds.clear();
      prioritizedNodes.forEach(id => visibleNodeIds.add(id));
    }
    
    // STEP 6: Build final visible nodes list
    const visibleNodes = allNodes.filter(node => visibleNodeIds.has(node.id));
    
    console.log(`⚡ NEO4J CUMULATIVE filter complete: ${visibleNodes.length} visible nodes (${additionalNodesForConnections.size} added for connectivity)`);
    console.log(`📋 Visible node breakdown by type:`, 
      visibleNodes.reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    );
    console.log(`🎯 Expanded nodes creating visibility:`, 
      Array.from(currentExpandedNodes).map(id => {
        const node = allNodes.find(n => n.id === id);
        return `${node?.name || id} (${node?.type || 'unknown'}) -> ${node?.childrenIds?.length || 0} children`;
      })
    );
    
    return visibleNodes;
  };

  // Helper methods for hierarchical logic
  const getHierarchicalNodeSize = (nodeType: string): number => {
    const sizeMap: Record<string, number> = {
      'repository': 60,
      'module': 45,
      'file': 35,
      'class': 25,
      'function': 20,
      'method': 18,
      'variable': 15
    };
    return sizeMap[nodeType] || 20;
  };

  const getHierarchicalNodeColor = (nodeType: string, language: string): string => {
    const hierarchyColors: Record<string, string> = {
      'repository': '#00d4ff',  // Cyan
      'module': '#14b8a6',      // Teal
      'file': '#f59e0b',        // Orange
      'class': '#8b5cf6',       // Purple
      'function': '#3b82f6',    // Blue
      'method': '#10b981',      // Green
      'variable': '#ec4899'     // Pink
    };
    return hierarchyColors[nodeType] || getNodeColor(nodeType, language);
  };



  // ENHANCED NEO4J-STYLE EDGE FILTERING: Preserve connection lines during exploration
  const filterEdgesForVisibleNodes = (allEdges: GraphEdge[], visibleNodes: GraphNode[]): GraphEdge[] => {
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    
    console.log(`🔗 NEO4J EDGE FILTERING: Processing ${allEdges.length} total edges for ${visibleNodes.length} visible nodes`);
    
    // Helper function to safely get node ID from edge endpoint (string or node object)
    const getEdgeNodeId = (node: string | GraphNode): string => {
      return typeof node === 'string' ? node : node.id;
    };
    
    // DEBUG: Analyze edge types to understand what we're working with
    const edgeTypeBreakdown = allEdges.reduce((acc, edge) => {
      acc[edge.type] = (acc[edge.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`📊 Edge type breakdown:`, edgeTypeBreakdown);
    
    // DEBUG: Find repository edges specifically - fix edge.source type handling
    const repositoryEdges = allEdges.filter(edge => {
      const sourceId = getEdgeNodeId(edge.source);
      return sourceId.startsWith('repo-');
    });
    console.log(`🏠 Repository edges found: ${repositoryEdges.length}`, 
      repositoryEdges.slice(0, 5).map(e => `${getEdgeNodeId(e.source)} -> ${getEdgeNodeId(e.target)} (${e.type})`)
    );
    
    // CRITICAL FIX: Create filtered edges with proper data binding
    // This ensures D3.js can properly track edges during updates
    const filteredEdges = allEdges.filter(edge => {
      const sourceId = getEdgeNodeId(edge.source);
      const targetId = getEdgeNodeId(edge.target);
      
      const sourceExists = visibleNodeIds.has(sourceId);
      const targetExists = visibleNodeIds.has(targetId);
      
      // STRICT REQUIREMENT: Both nodes must exist for D3.js stability
      if (!sourceExists || !targetExists) {
        // DEBUG: Log what's being filtered out (reduced logging to prevent spam)
        if ((edge.type === 'contains' || sourceId.startsWith('repo-')) && Math.random() < 0.1) {
          console.log(`⚠️ Filtering out structural edge: ${sourceId} -> ${targetId} (${edge.type})`);
        }
        return false;
      }
      
      // Show ALL edges between visible nodes - this preserves connectivity
      return true;
    }).map(edge => ({
      // CRITICAL FIX: Ensure edge data is properly structured for D3.js
      ...edge,
      // Normalize source and target to strings for consistent data binding
      source: getEdgeNodeId(edge.source),
      target: getEdgeNodeId(edge.target)
    }));
    
    // DEBUG: Analyze what was preserved vs filtered
    const preservedByType = filteredEdges.reduce((acc, edge) => {
      acc[edge.type] = (acc[edge.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`🔗 NEO4J EDGE FILTERING COMPLETE: ${filteredEdges.length}/${allEdges.length} edges preserved`);
    console.log(`📊 Preserved edge types:`, preservedByType);
    console.log(`📊 Repository edges preserved: ${filteredEdges.filter(e => e.source.toString().startsWith('repo-')).length}`);
    
    // CRITICAL DEBUG: If we have very few edges, something is wrong
    if (filteredEdges.length < 10 && allEdges.length > 100) {
      console.warn(`🚨 EDGE FILTERING ISSUE: Only ${filteredEdges.length} edges preserved from ${allEdges.length} total - this seems wrong!`);
      console.log(`🔍 Visible node types:`, visibleNodes.reduce((acc, n) => {
        acc[n.type] = (acc[n.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>));
    }
    
    return filteredEdges;
  };

  // Phase 6: Enhanced search and filtering
  const getFilteredNodes = (): GraphNode[] => {
    let nodes = graphData.nodes;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      nodes = nodes.filter(node => 
        node.name.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query) ||
        node.filePath.toLowerCase().includes(query)
      );
    }
    
    // Apply type filter
    if (filteredNodeType !== 'all') {
      nodes = nodes.filter(node => node.type === filteredNodeType);
    }
    
    return nodes;
  };

  const getAvailableNodeTypes = (): string[] => {
    const types = new Set(graphData.nodes.map(node => node.type));
    return Array.from(types).sort();
  };

  // Phase 6: Jump to node functionality
  const jumpToNode = (nodeId: string) => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) {
      setFocusedNodeId(nodeId);
      setSelectedNode(node);
      onNodeSelect(node);
      
      // Update zoom to focus on node
      setZoomLevel(1.5);
    }
  };

  // Phase 6: Expand all nodes at current level
  const handleExpandAllCurrentLevel = async () => {
    setExpandAllInProgress(true);
    
    try {
      // Find expandable nodes at the current hierarchy level
      const expandableNodes = graphData.nodes.filter(node => 
        node.isExpandable && !node.isExpanded && node.level === hierarchyLevel
      );
      
      if (expandableNodes.length === 0) {
        console.log('📋 No expandable nodes found at current level');
        return;
      }
      
      console.log(`🚀 Expanding ${expandableNodes.length} nodes at level ${hierarchyLevel}`);
      
      // Mark all nodes as expanded
      const newExpandedNodes = new Set(expandedNodes);
      expandableNodes.forEach(node => {
        newExpandedNodes.add(node.id);
      });
      
      setExpandedNodes(newExpandedNodes);
      
      // Update hierarchy level and breadcrumbs
      if (expandableNodes.length > 0) {
        const maxLevel = Math.max(...expandableNodes.map(n => n.level || 0));
        setHierarchyLevel(maxLevel + 1);
        
        // Add expanded nodes to breadcrumb
        const newBreadcrumb = [...breadcrumbNodes];
        expandableNodes.forEach(node => {
          if (!newBreadcrumb.find(n => n.id === node.id)) {
            newBreadcrumb.push(node);
          }
        });
        setBreadcrumbNodes(newBreadcrumb);
      }
      
      console.log(`✅ Successfully marked ${expandableNodes.length} nodes as expanded`);
      
    } catch (error) {
      console.error('❌ Failed to expand all nodes:', error);
    } finally {
      setExpandAllInProgress(false);
    }
  };

  // Expand all expandable nodes in the entire graph
  const handleExpandAll = async () => {
    setExpandAllInProgress(true);
    
    try {
      // Find all expandable nodes in the entire dataset
      const expandableNodes = allNodesData.nodes.filter(node => 
        node.isExpandable && !expandedNodes.has(node.id)
      );
      
      if (expandableNodes.length === 0) {
        console.log('📋 No expandable nodes found in the graph');
        return;
      }
      
      console.log(`🚀 Expanding all ${expandableNodes.length} expandable nodes`);
      
      // Add all expandable nodes to the expanded set
      const newExpandedNodes = new Set(expandedNodes);
      expandableNodes.forEach(node => {
        newExpandedNodes.add(node.id);
      });
      
      setExpandedNodes(newExpandedNodes);
      
      // Update hierarchy level to show the deepest level
      const maxLevel = Math.max(...allNodesData.nodes.map(n => n.level || 0));
      setHierarchyLevel(maxLevel);
      
      // Update breadcrumbs to include all levels
      const allLevelNodes = allNodesData.nodes.filter(n => n.level !== undefined && n.level >= 0);
      setBreadcrumbNodes(allLevelNodes);
      
      console.log(`✅ Successfully expanded all ${expandableNodes.length} nodes`);
      
    } catch (error) {
      console.error('❌ Failed to expand all nodes:', error);
    } finally {
      setExpandAllInProgress(false);
    }
  };

  // Collapse all expanded nodes and reset to initial state
  const handleCollapseAll = async () => {
    setExpandAllInProgress(true);
    
    try {
      const expandedCount = expandedNodes.size;
      console.log(`🔄 Collapsing all ${expandedCount} expanded nodes`);
      
      // Reset expanded nodes
      setExpandedNodes(new Set());
      
      // Reset hierarchy level to 0
      setHierarchyLevel(0);
      
      // Reset breadcrumbs to only show root nodes
      const rootNodes = graphData.nodes.filter(n => n.level === 0);
      setBreadcrumbNodes(rootNodes);
      
      console.log(`✅ Successfully collapsed all ${expandedCount} nodes`);
      
    } catch (error) {
      console.error('❌ Failed to collapse all nodes:', error);
    } finally {
      setExpandAllInProgress(false);
    }
  };

  // Phase 6: Keyboard navigation
  useEffect(() => {
    if (!keyboardNavigationEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't interfere with input fields
      if (event.target instanceof HTMLInputElement) return;

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          // Navigate to parent node
          if (selectedNode?.parentId) {
            const parentNode = graphData.nodes.find(n => n.id === selectedNode.parentId);
            if (parentNode) jumpToNode(parentNode.id);
          }
          break;
          
        case 'ArrowDown':
          event.preventDefault();
          // Navigate to first child
          if (selectedNode?.childrenIds && selectedNode.childrenIds.length > 0) {
            jumpToNode(selectedNode.childrenIds[0]);
          }
          break;
          
        case 'ArrowLeft':
        case 'ArrowRight':
          event.preventDefault();
          // Navigate to siblings
          if (selectedNode?.parentId) {
            const siblings = graphData.nodes.filter(n => n.parentId === selectedNode.parentId);
            const currentIndex = siblings.findIndex(n => n.id === selectedNode.id);
            if (currentIndex !== -1) {
              const nextIndex = event.key === 'ArrowRight' 
                ? (currentIndex + 1) % siblings.length
                : (currentIndex - 1 + siblings.length) % siblings.length;
              jumpToNode(siblings[nextIndex].id);
            }
          }
          break;
          
        case 'Enter':
          event.preventDefault();
          // Expand selected node
          if (selectedNode?.isExpandable) {
            handleInstantNodeToggle(selectedNode);
          }
          break;
          
        case 'Escape':
          event.preventDefault();
          // Clear selection
          setSelectedNode(null);
          setFocusedNodeId(null);
          break;
          
        case '/':
          event.preventDefault();
          // Focus search
          searchInputRef.current?.focus();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardNavigationEnabled, selectedNode, graphData.nodes]);

  // Load graph data
  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Update container dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerDimensions({
          width: rect.width || 800,
          height: rect.height || 600
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
    setFocusedNodeId(node.id);
    onNodeSelect(node);
    
    // NEO4J-STYLE INSTANT EXPANSION: Handle expansion/collapse instantly without server calls
    if (node.isExpandable) {
      handleInstantNodeToggle(node);
    }
  };

  // NEO4J-STYLE INSTANT NODE EXPANSION: Pre-loaded data with instant client-side toggling
  const handleInstantNodeToggle = (node: GraphNode) => {
    console.log(`🚀 INSTANT ${expandedNodes.has(node.id) ? 'COLLAPSE' : 'EXPAND'}: ${node.name} (${node.type})`);
    console.log(`📋 Node details:`, {
      id: node.id,
      hasChildren: node.childrenIds && node.childrenIds.length > 0,
      childCount: node.childrenIds?.length || 0,
      childIds: node.childrenIds?.slice(0, 3) || [],
      isExpandable: node.isExpandable,
      currentlyExpanded: expandedNodes.has(node.id)
    });
    
    // Prevent rapid clicking
    if (nodeExpansionInProgress.has(node.id)) {
      console.log(`⚠️ Node ${node.name} is already being processed, ignoring click`);
      return;
    }

    const isCurrentlyExpanded = expandedNodes.has(node.id);
    const newExpandedNodes = new Set(expandedNodes);

    if (isCurrentlyExpanded) {
      // CRITICAL FIX: Complete collapse - remove node and all descendants from expanded set
      console.log(`🔽 Collapsing node ${node.name} and all descendants`);
      
      // Recursively collapse all descendants  
      const collapseNodeAndChildren = (nodeId: string) => {
        newExpandedNodes.delete(nodeId);
        const nodeToCollapse = allNodesData.nodes.find(n => n.id === nodeId);
        if (nodeToCollapse?.childrenIds) {
          console.log(`🔽 Collapsing children of ${nodeToCollapse.name}: [${nodeToCollapse.childrenIds.slice(0, 3).join(', ')}${nodeToCollapse.childrenIds.length > 3 ? '...' : ''}]`);
          nodeToCollapse.childrenIds.forEach(childId => {
            collapseNodeAndChildren(childId);
          });
        }
      };
      
      // CRITICAL FIX: Remove the collapsed node from expanded set first
      collapseNodeAndChildren(node.id);
      
      console.log(`✅ COMPLETE COLLAPSE: ${node.name} and all descendants removed from expanded set`);
      console.log(`📊 Remaining expanded nodes: ${Array.from(newExpandedNodes).map(id => {
        const n = allNodesData.nodes.find(n => n.id === id);
        return `${n?.name || id}`;
      }).join(', ')}`);
      
    } else {
      // INSTANT EXPAND: Add to expanded set
      console.log(`🔼 Expanding node ${node.name} with ${node.childrenIds?.length || 0} children`);
      if (node.childrenIds && node.childrenIds.length > 0) {
        console.log(`🔼 Children to show:`, node.childrenIds.slice(0, 5).map(childId => {
          const childNode = allNodesData.nodes.find(n => n.id === childId);
          return `${childNode?.name || childId} (${childNode?.type || 'unknown'})`;
        }));
      }
      newExpandedNodes.add(node.id);
      console.log(`✅ INSTANT EXPAND complete: ${node.name}`);
    }
    
    console.log(`📊 Updated expansion state:`, {
      previouslyExpanded: expandedNodes.size,
      nowExpanded: newExpandedNodes.size,
      expandedNodeIds: Array.from(newExpandedNodes)
    });
    
    console.log(`📊 Expansion state before update:`, {
      previouslyExpanded: expandedNodes.size,
      nowExpanded: newExpandedNodes.size,
      action: isCurrentlyExpanded ? 'collapse' : 'expand',
      targetNode: node.name
    });
    
    // CRITICAL FIX: Apply expansion state changes first
    setExpandedNodes(newExpandedNodes);
    
    // CRITICAL FIX: Force immediate re-filtering with the new expanded state
    const allNodes = allNodesData.nodes;
    console.log(`🔍 IMMEDIATE FILTERING from ${allNodes.length} total nodes with updated state...`);
    const visibleNodes = filterNodesForCurrentHierarchyWithState(allNodes, newExpandedNodes);
    const visibleEdges = filterEdgesForVisibleNodes(allNodesData.edges, visibleNodes);
    
    console.log(`🎯 VISIBILITY UPDATE RESULT:`, {
      visibleNodeCount: visibleNodes.length,
      visibleEdgeCount: visibleEdges.length,
      expandedNodeCount: newExpandedNodes.size,
      collapsedSuccessfully: isCurrentlyExpanded && visibleNodes.filter(n => n.id !== node.id && (node.childrenIds?.includes(n.id) || false)).length === 0
    });
    
    // CRITICAL FIX: Update the graph data with proper expansion state sync
    setGraphData({
      nodes: visibleNodes.map(n => ({
        ...n,
        isExpanded: newExpandedNodes.has(n.id)
      })),
      edges: visibleEdges
    });
    
    console.log(`🎯 Instant toggle complete. Expanded nodes: ${newExpandedNodes.size}, visible nodes: ${visibleNodes.length}`);
  };


  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Graph Container */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {/* D3 Hierarchical Graph Engine */}
        <D3GraphEngine
          data={graphData}
          width={containerDimensions.width}
          height={containerDimensions.height}
          onNodeClick={handleNodeClick}
          onNodeHover={setSelectedNode}
          zoomLevel={zoomLevel}
          simulationRunning={simulationRunning}
        />

        {/* Phase 6: Enhanced Breadcrumb Navigation */}
        {breadcrumbNodes.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div className="backdrop-blur-xl bg-black/40 dark:bg-black/60 border border-cyan-500/30 rounded-xl px-4 py-2 
                           shadow-[0_0_20px_rgba(34,211,238,0.3)] flex items-center gap-2">
              {breadcrumbNodes.map((node, index) => (
                <React.Fragment key={node.id}>
                  <button
                    onClick={() => jumpToNode(node.id)}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors text-sm font-medium"
                  >
                    {node.name}
                  </button>
                  {index < breadcrumbNodes.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-cyan-400/50" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        )}

        {/* Advanced Control Panel - Enhanced with Phase 6 features */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          className="absolute top-4 right-4 z-40"
        >
          {/* Controls Toggle */}
          <motion.button
            onClick={() => setShowControls(!showControls)}
            className="mb-2 p-3 backdrop-blur-xl bg-black/40 dark:bg-black/60 border border-cyan-500/30 rounded-xl 
                       hover:bg-black/50 dark:hover:bg-black/70 hover:border-cyan-400/50 transition-all duration-300
                       shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]
                       text-cyan-400 hover:text-cyan-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Settings className="w-5 h-5" />
          </motion.button>

          {/* Advanced Controls Panel */}
          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="backdrop-blur-xl bg-black/40 dark:bg-black/60 border border-cyan-500/30 rounded-xl p-4 min-w-[320px]
                           shadow-[0_0_40px_rgba(34,211,238,0.4)] border-glow max-h-[80vh] overflow-y-auto custom-scrollbar"
              >
                {/* Close Button */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-cyan-400 font-semibold text-sm">Enhanced Navigation</h3>
                  <button
                    onClick={() => setShowControls(false)}
                    className="text-cyan-400/60 hover:text-cyan-400 transition-colors p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Phase 6: Search & Filter Section */}
                <div className="mb-4">
                  <label className="text-cyan-400/80 text-xs font-medium mb-2 block flex items-center gap-2">
                    <Search className="w-3 h-3" />
                    Search Nodes (Press '/' to focus)
                  </label>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, type, or path..."
                    className="w-full px-3 py-2 bg-black/30 border border-cyan-500/20 rounded-lg text-cyan-400 
                             placeholder-cyan-400/50 focus:border-cyan-400/50 focus:outline-none text-xs"
                  />
                  {searchQuery && (
                    <div className="mt-2 text-xs text-cyan-400/70">
                      Found {getFilteredNodes().length} matching nodes
                    </div>
                  )}
                </div>

                {/* Node Type Filter */}
                <div className="mb-4">
                  <label className="text-cyan-400/80 text-xs font-medium mb-2 block flex items-center gap-2">
                    <Filter className="w-3 h-3" />
                    Filter by Type
                  </label>
                  <select
                    value={filteredNodeType}
                    onChange={(e) => setFilteredNodeType(e.target.value)}
                    className="w-full px-3 py-2 bg-black/30 border border-cyan-500/20 rounded-lg text-cyan-400 
                             focus:border-cyan-400/50 focus:outline-none text-xs"
                  >
                    <option value="all">All Types</option>
                    {getAvailableNodeTypes().map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Quick Jump to Nodes */}
                {getFilteredNodes().length > 0 && getFilteredNodes().length <= 10 && (
                  <div className="mb-4">
                    <label className="text-cyan-400/80 text-xs font-medium mb-2 block flex items-center gap-2">
                      <Target className="w-3 h-3" />
                      Quick Jump
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {getFilteredNodes().map(node => (
                        <button
                          key={node.id}
                          onClick={() => jumpToNode(node.id)}
                          className="w-full text-left px-2 py-1 bg-black/20 border border-cyan-500/10 rounded 
                                   text-cyan-400 hover:border-cyan-400/30 transition-colors text-xs"
                        >
                          <span className="font-medium">{node.name}</span>
                          <span className="text-cyan-400/50 ml-2">({node.type})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Keyboard Navigation Toggle */}
                <div className="mb-4">
                  <label className="text-cyan-400/80 text-xs font-medium mb-2 block">
                    Keyboard Navigation
                  </label>
                  <button
                    onClick={() => setKeyboardNavigationEnabled(!keyboardNavigationEnabled)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      keyboardNavigationEnabled
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-black/30 text-cyan-400 border border-cyan-500/20'
                    }`}
                  >
                    {keyboardNavigationEnabled ? '✓ Enabled' : 'Click to Enable'}
                  </button>
                  {keyboardNavigationEnabled && (
                    <div className="mt-2 text-xs text-cyan-400/60 space-y-1">
                      <div>↑↓ Parent/Child • ←→ Siblings</div>
                      <div>Enter: Expand • Esc: Clear • /: Search</div>
                    </div>
                  )}
                </div>

                {/* Hierarchy Level Display */}
                <div className="mb-4">
                  <label className="text-cyan-400/80 text-xs font-medium mb-2 block">
                    Current Level: {hierarchyLevel === 0 ? 'Repository' : `Level ${hierarchyLevel}`}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setHierarchyLevel(0);
                        setExpandedNodes(new Set());
                        setNavigationPath([]);
                        setBreadcrumbNodes(graphData.nodes.filter(n => n.level === 0));
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-black/30 border border-cyan-500/20 rounded-lg 
                                 text-cyan-400 hover:border-cyan-400/50 transition-colors text-xs"
                    >
                      <Home className="w-3 h-3" />
                      Root
                    </button>
                    {hierarchyLevel > 0 && (
                      <button
                        onClick={() => {
                          setHierarchyLevel(Math.max(0, hierarchyLevel - 1));
                          const newPath = navigationPath.slice(0, -1);
                          setNavigationPath(newPath);
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-black/30 border border-cyan-500/20 rounded-lg 
                                   text-cyan-400 hover:border-cyan-400/50 transition-colors text-xs"
                      >
                        <ChevronUp className="w-3 h-3" />
                        Back
                      </button>
                    )}
                  </div>
                </div>

                {/* Enhanced Expansion Controls */}
                <div className="mb-4">
                  <label className="text-cyan-400/80 text-xs font-medium mb-2 block">
                    Node Expansion
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={handleExpandAll}
                      disabled={expandAllInProgress}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-black/30 border border-cyan-500/20 
                                 rounded-lg text-cyan-400 hover:border-cyan-400/50 transition-colors text-xs disabled:opacity-50"
                    >
                      {expandAllInProgress ? (
                        <>
                          <div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                          Expanding...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          Expand All
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCollapseAll}
                      disabled={expandAllInProgress}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-black/30 border border-cyan-500/20 
                                 rounded-lg text-cyan-400 hover:border-cyan-400/50 transition-colors text-xs disabled:opacity-50"
                    >
                      {expandAllInProgress ? (
                        <>
                          <div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                          Collapsing...
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          Collapse All
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-xs text-cyan-400/60">
                    {expandedNodes.size} nodes expanded
                  </div>
                </div>

                {/* Physics Simulation Control */}
                <div className="mb-4">
                  <label className="text-cyan-400/80 text-xs font-medium mb-2 block">
                    Physics Simulation
                  </label>
                  <button
                    onClick={() => setSimulationRunning(!simulationRunning)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      simulationRunning
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    {simulationRunning ? 'Running' : 'Paused'}
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="mb-4">
                  <label className="text-cyan-400/80 text-xs font-medium mb-2 block">
                    Zoom Level: {(zoomLevel * 100).toFixed(0)}%
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setZoomLevel(Math.max(0.1, zoomLevel - 0.2))}
                      className="p-2 bg-black/30 border border-cyan-500/20 rounded-lg text-cyan-400 hover:border-cyan-400/50 transition-colors"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <div className="flex-1 bg-black/30 rounded-lg h-2 border border-cyan-500/20">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-lg transition-all duration-300
                                   shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                        style={{ width: `${Math.min(100, (zoomLevel / 2) * 100)}%` }}
                      />
                    </div>
                    <button
                      onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.2))}
                      className="p-2 bg-black/30 border border-cyan-500/20 rounded-lg text-cyan-400 hover:border-cyan-400/50 transition-colors"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Reset All */}
                <button
                  onClick={() => {
                    setZoomLevel(1);
                    setSimulationRunning(true);
                    setHierarchyLevel(0);
                    setExpandedNodes(new Set());
                    setNavigationPath([]);
                    setSearchQuery('');
                    setFilteredNodeType('all');
                    setFocusedNodeId(null);
                    setSelectedNode(null);
                    setBreadcrumbNodes(graphData.nodes.filter(n => n.level === 0));
                    setKeyboardNavigationEnabled(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-black/30 border border-cyan-500/20 
                             rounded-lg text-cyan-400 hover:border-cyan-400/50 transition-colors text-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset All
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Node Info Overlay - Enhanced with Archon styling */}
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-4 left-4 backdrop-blur-xl bg-black/40 dark:bg-black/60 border border-cyan-500/30 
                       rounded-xl p-4 max-w-sm z-50 shadow-[0_0_30px_rgba(34,211,238,0.4)]"
          >
            <div className="flex items-center gap-2 mb-3">
              <Badge 
                className="text-white border-0 shadow-[0_0_10px_rgba(34,211,238,0.3)]" 
                style={{ backgroundColor: selectedNode.color }}
              >
                {selectedNode.type}
              </Badge>
              <Badge className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                {selectedNode.language}
              </Badge>
              {focusedNodeId === selectedNode.id && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  Focused
                </Badge>
              )}
              {nodeExpansionInProgress.has(selectedNode.id) && (
                <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                  <div className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
                  Expanding
                </Badge>
              )}
            </div>
            
            <h4 className="font-semibold text-lg mb-1 text-cyan-400">{selectedNode.name}</h4>
            <p className="text-sm text-cyan-400/70 mb-1">
              {selectedNode.filePath}
            </p>
            {selectedNode.lineNumber && (
              <p className="text-xs text-cyan-400/50">
                Line {selectedNode.lineNumber}
              </p>
            )}
            
            {/* Phase 6: Additional node info */}
            {selectedNode.level !== undefined && (
              <p className="text-xs text-cyan-400/50 mt-2">
                Level: {selectedNode.level} • 
                {selectedNode.isExpandable ? ' Expandable' : ' Leaf node'}
                {selectedNode.childrenIds && selectedNode.childrenIds.length > 0 && 
                  ` • ${selectedNode.childrenIds.length} children`
                }
              </p>
            )}
            
            <button
              onClick={() => {
                setSelectedNode(null);
                setFocusedNodeId(null);
              }}
              className="absolute top-3 right-3 text-cyan-400/60 hover:text-cyan-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </div>

      {/* Enhanced Status Bar with Archon styling */}
      <div className="p-3 border-t border-cyan-500/20 bg-black/20 dark:bg-black/40 backdrop-blur-sm">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-cyan-400/80">
              <span className="text-cyan-400 font-medium">{graphData.nodes.length}</span> nodes visible
            </span>
            <span className="text-cyan-400/80">
              <span className="text-cyan-400 font-medium">{graphData.edges.length}</span> connections
            </span>
            <span className="text-cyan-400/80">
              Level: <span className="text-cyan-400 font-medium">{hierarchyLevel === 0 ? 'Root' : hierarchyLevel}</span>
            </span>
            {searchQuery && (
              <span className="text-cyan-400/80">
                Filtered: <span className="text-cyan-400 font-medium">{getFilteredNodes().length}</span> matches
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {keyboardNavigationEnabled && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.6)]"></div>
                <span className="text-cyan-400/80 text-xs">Keyboard Nav</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                graphData.nodes.length > 0 
                  ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.6)]' 
                  : 'bg-gray-400'
              }`}></div>
              <span className="text-cyan-400/80">
                {graphData.nodes.length > 0 ? 'Connected' : 'No data'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};