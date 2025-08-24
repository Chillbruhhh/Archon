import React, { useEffect, useRef, useCallback } from 'react';
import cytoscape, { Core, NodeSingular, EdgeSingular } from 'cytoscape';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import { GraphNode, GraphEdge, GraphData } from '../types';

// Register layout extensions
cytoscape.use(cola);
cytoscape.use(dagre);

interface CytoscapeGraphEngineProps {
  data: GraphData;
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  zoomLevel: number;
  layout: 'cola' | 'dagre' | 'circle' | 'grid' | 'cose';
}

export const CytoscapeGraphEngine: React.FC<CytoscapeGraphEngineProps> = ({
  data,
  width,
  height,
  onNodeClick,
  onNodeHover,
  zoomLevel,
  layout = 'cola'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Enhanced node colors with better contrast for dark backgrounds
  const getNodeColor = (nodeType: string) => {
    switch (nodeType) {
      case 'function': return '#f59e0b'; // amber
      case 'class': return '#10b981';    // emerald
      case 'variable': return '#3b82f6'; // blue
      case 'import': return '#8b5cf6';   // violet
      case 'module': return '#ef4444';   // red
      case 'file': return '#6b7280';     // gray
      case 'interface': return '#06b6d4'; // cyan
      case 'enum': return '#ec4899';     // pink
      case 'namespace': return '#84cc16'; // lime
      case 'method': return '#f97316';   // orange
      default: return '#9ca3af';         // gray-400
    }
  };

  const getEdgeColor = (edgeType: string) => {
    switch (edgeType) {
      case 'calls': return '#ef4444';
      case 'imports': return '#3b82f6';
      case 'inherits': return '#10b981';
      case 'references': return '#f59e0b';
      case 'contains': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getLayoutConfig = (layoutType: string) => {
    const baseConfig = {
      name: layoutType,
      animate: true,
      animationDuration: 1500,
      animationEasing: 'ease-out-quart',
      fit: true,
      padding: 80
    };

    switch (layoutType) {
      case 'cola':
        return {
          ...baseConfig,
          avoidOverlap: true,
          handleDisconnected: true,
          convergenceThreshold: 0.01,
          nodeSpacing: 80,
          edgeLength: 150,
          unconstrIter: 2000,
          userConstIter: 800,
          allConstIter: 400,
          infinite: false
        };
      case 'dagre':
        return {
          ...baseConfig,
          rankDir: 'TB',
          nodeSep: 80,
          edgeSep: 20,
          rankSep: 150
        };
      case 'cose':
        return {
          ...baseConfig,
          nodeRepulsion: () => 800000,
          nodeOverlap: 20,
          idealEdgeLength: () => 150,
          edgeElasticity: () => 200,
          nestingFactor: 8,
          gravity: 100,
          numIter: 2000,
          coolingFactor: 0.98,
          minTemp: 1.0
        };
      case 'circle':
        return {
          ...baseConfig,
          radius: Math.min(width, height) / 2.5,
          startAngle: -Math.PI / 2,
          sweep: 2 * Math.PI,
          clockwise: true,
          sort: (a, b) => a.data('type').localeCompare(b.data('type'))
        };
      case 'grid':
        return {
          ...baseConfig,
          cols: Math.ceil(Math.sqrt(data.nodes.length)),
          rows: Math.ceil(data.nodes.length / Math.ceil(Math.sqrt(data.nodes.length))),
          position: (node) => {
            const index = data.nodes.findIndex(n => n.id === node.data('id'));
            const cols = Math.ceil(Math.sqrt(data.nodes.length));
            return {
              row: Math.floor(index / cols),
              col: index % cols
            };
          }
        };
      default:
        return baseConfig;
    }
  };

  const initializeGraph = useCallback(() => {
    if (!containerRef.current || data.nodes.length === 0) return;

    // Clear existing instance
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Convert data to Cytoscape format
    const elements = [
      ...data.nodes.map(node => ({
        data: {
          id: node.id,
          label: node.name,
          type: node.type,
          language: node.language,
          filePath: node.filePath,
          lineNumber: node.lineNumber,
          size: node.size,
          color: node.color,
          originalNode: node
        }
      })),
      ...data.edges.map(edge => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          weight: edge.weight,
          originalEdge: edge
        }
      }))
    ];

    // Initialize Cytoscape with Neo4j-style configuration
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'width': (node) => Math.max(30, node.data('size') * 2.5),
            'height': (node) => Math.max(30, node.data('size') * 2.5),
            'background-color': (node) => getNodeColor(node.data('type')),
            'background-opacity': 0.9,
            'border-width': 3,
            'border-color': '#ffffff',
            'border-opacity': 0.3,
            'label': (node) => {
              const label = node.data('label');
              return label.length > 15 ? label.substring(0, 15) + '...' : label;
            },
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 8,
            'font-size': '12px',
            'font-weight': '600',
            'font-family': 'Inter, system-ui, sans-serif',
            'color': '#ffffff',
            'text-outline-width': 3,
            'text-outline-color': 'rgba(0, 0, 0, 0.8)',
            'text-outline-opacity': 1,
            'overlay-padding': '8px',
            'z-index': 10,
            // Neo4j-style shadow and glow
            'shadow-blur': '20px',
            'shadow-color': (node) => getNodeColor(node.data('type')),
            'shadow-opacity': '0.4',
            'shadow-offset-x': '0px',
            'shadow-offset-y': '0px'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 5,
            'border-color': '#00d4ff',
            'border-opacity': 1,
            'shadow-blur': '30px',
            'shadow-color': '#00d4ff',
            'shadow-opacity': '0.8',
            'overlay-opacity': 0.3,
            'overlay-color': '#00d4ff',
            'z-index': 999
          }
        },
        {
          selector: 'node:hover',
          style: {
            'border-width': 4,
            'border-color': '#ffffff',
            'border-opacity': 0.8,
            'transform': 'scale(1.15)',
            'shadow-blur': '25px',
            'shadow-opacity': '0.6',
            'z-index': 100
          }
        },
        {
          selector: 'edge',
          style: {
            'width': (edge) => Math.max(2, edge.data('weight') * 2),
            'line-color': (edge) => getEdgeColor(edge.data('type')),
            'target-arrow-color': (edge) => getEdgeColor(edge.data('type')),
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.5,
            'curve-style': 'unbundled-bezier',
            'control-point-step-size': 60,
            'opacity': 0.6,
            'z-index': 1,
            // Subtle glow for edges
            'shadow-blur': '10px',
            'shadow-color': (edge) => getEdgeColor(edge.data('type')),
            'shadow-opacity': '0.3'
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'width': (edge) => Math.max(3, edge.data('weight') * 3),
            'opacity': 1,
            'shadow-blur': '15px',
            'shadow-opacity': '0.6',
            'z-index': 998
          }
        },
        {
          selector: 'edge:hover',
          style: {
            'width': (edge) => Math.max(3, edge.data('weight') * 2.5),
            'opacity': 0.9,
            'shadow-blur': '12px',
            'shadow-opacity': '0.5'
          }
        },
        // Style for different node types with enhanced visuals
        {
          selector: 'node[type="class"]',
          style: {
            'shape': 'round-rectangle',
            'background-color': '#10b981',
            'border-color': '#34d399'
          }
        },
        {
          selector: 'node[type="function"], node[type="method"]',
          style: {
            'shape': 'ellipse',
            'background-color': '#f59e0b',
            'border-color': '#fbbf24'
          }
        },
        {
          selector: 'node[type="variable"]',
          style: {
            'shape': 'diamond',
            'background-color': '#3b82f6',
            'border-color': '#60a5fa'
          }
        },
        {
          selector: 'node[type="file"]',
          style: {
            'shape': 'round-rectangle',
            'background-color': '#6b7280',
            'border-color': '#9ca3af',
            'width': (node) => Math.max(40, node.data('size') * 3),
            'height': (node) => Math.max(25, node.data('size') * 2)
          }
        }
      ],
      layout: getLayoutConfig(layout),
      minZoom: 0.1,
      maxZoom: 5,
      wheelSensitivity: 0.3,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: true,
      autoungrabify: false,
      autounselectify: false,
      selectionType: 'single'
    });

    cyRef.current = cy;

    // Enhanced event handlers
    cy.on('tap', 'node', (event) => {
      const node = event.target;
      const originalNode = node.data('originalNode');
      
      // Add selection animation
      node.animate({
        style: {
          'transform': 'scale(1.3)'
        },
        duration: 200,
        easing: 'ease-out'
      }).delay(100).animate({
        style: {
          'transform': 'scale(1.15)'
        },
        duration: 200,
        easing: 'ease-in'
      });
      
      onNodeClick?.(originalNode);
    });

    cy.on('mouseover', 'node', (event) => {
      const node = event.target;
      const originalNode = node.data('originalNode');
      
      // Highlight connected nodes
      const connectedEdges = node.connectedEdges();
      const connectedNodes = connectedEdges.connectedNodes();
      
      // Dim other nodes
      cy.elements().not(node).not(connectedNodes).not(connectedEdges).style({
        'opacity': 0.3
      });
      
      // Highlight connected elements
      connectedEdges.style({
        'opacity': 0.8,
        'width': (edge) => Math.max(3, edge.data('weight') * 2.5)
      });
      
      connectedNodes.style({
        'opacity': 0.8,
        'border-width': 3,
        'border-opacity': 0.6
      });
      
      onNodeHover?.(originalNode);
    });

    cy.on('mouseout', 'node', () => {
      // Reset all styles
      cy.elements().removeStyle();
      onNodeHover?.(null);
    });

    // Add double-click to fit functionality
    cy.on('dblclick', (event) => {
      if (event.target === cy) {
        cy.fit(cy.elements(), 80);
      }
    });

    // Apply zoom level with smooth animation
    cy.animate({
      zoom: zoomLevel,
      center: cy.elements()
    }, {
      duration: 300,
      easing: 'ease-out'
    });

    return cy;
  }, [data, width, height, layout, onNodeClick, onNodeHover]);

  // Initialize graph when component mounts or data changes
  useEffect(() => {
    const cy = initializeGraph();
    return () => {
      cy?.destroy();
    };
  }, [initializeGraph]);

  // Update zoom level with smooth animation
  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: zoomLevel,
        center: cyRef.current.elements()
      }, {
        duration: 300,
        easing: 'ease-out'
      });
    }
  }, [zoomLevel]);

  // Relayout when layout type changes
  useEffect(() => {
    if (cyRef.current) {
      const layoutConfig = getLayoutConfig(layout);
      const layoutInstance = cyRef.current.layout(layoutConfig);
      layoutInstance.run();
    }
  }, [layout, data]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%',
        background: 'transparent'
      }}
      className="knowledge-graph-cytoscape"
    />
  );
};