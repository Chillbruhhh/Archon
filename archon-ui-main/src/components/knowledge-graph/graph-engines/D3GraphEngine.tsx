import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphEdge, GraphData } from '../types';

interface D3GraphEngineProps {
  data: GraphData;
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  zoomLevel: number;
  simulationRunning: boolean;
}

export const D3GraphEngine: React.FC<D3GraphEngineProps> = ({
  data,
  width,
  height,
  onNodeClick,
  onNodeHover,
  zoomLevel,
  simulationRunning
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  
  // STABILITY FIX: Use refs for stable callback references to prevent constant re-initialization
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeHoverRef = useRef(onNodeHover);
  
  // Update refs when callbacks change, but don't trigger re-initialization
  onNodeClickRef.current = onNodeClick;
  onNodeHoverRef.current = onNodeHover;

  const initializeSimulation = useCallback(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    // PERFORMANCE FIX: Adaptive rendering based on node count
    const nodeCount = data.nodes.length;
    const isHighNodeCount = nodeCount > 30; // Threshold for performance mode
    const isVeryHighNodeCount = nodeCount > 50; // Threshold for minimal rendering

    console.log(`🎯 Performance mode: ${nodeCount} nodes, high=${isHighNodeCount}, veryHigh=${isVeryHighNodeCount}`);

    const svg = d3.select(svgRef.current);
    
    // CRITICAL TOPOLOGY FIX: Don't clear everything - use D3.js update patterns instead
    // This prevents connection lines from detaching during expansion operations
    const existingContainer = svg.select('.graph-container');
    const isFirstRender = existingContainer.empty();
    
    if (isFirstRender) {
      console.log('🎯 INITIAL RENDER: Setting up SVG structure');
      svg.selectAll('*').remove(); // Only clear on first render

      
      // Set proper SVG dimensions to fill container
      svg
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      // PERFORMANCE FIX: Conditionally create expensive visual effects
      const defs = svg.append('defs');
      
      // Only add neon glow filter for low node counts (expensive effect)
      if (!isVeryHighNodeCount) {
        const glowFilter = defs.append('filter')
          .attr('id', 'neon-glow')
          .attr('x', '-50%')
          .attr('y', '-50%')
          .attr('width', '200%')
          .attr('height', '200%');
        
        glowFilter.append('feGaussianBlur')
          .attr('stdDeviation', isHighNodeCount ? '2' : '4') // Reduce glow intensity for performance
          .attr('result', 'coloredBlur');
        
        const feMerge = glowFilter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
      }

      // Create arrow markers for different relationship types
      const arrowTypes = ['calls', 'imports', 'inherits', 'references', 'contains'];
      arrowTypes.forEach(type => {
        defs.append('marker')
          .attr('id', `arrowhead-${type}`)
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 15)
          .attr('refY', 0)
          .attr('markerWidth', 8)
          .attr('markerHeight', 8)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5')
          .attr('fill', () => {
            switch (type) {
              case 'calls': return '#ef4444';
              case 'imports': return '#3b82f6';
              case 'inherits': return '#10b981';
              case 'references': return '#f59e0b';
              case 'contains': return '#00d4ff';
              default: return '#6b7280';
            }
          });
      });
    } else {
      console.log('🔄 DATA UPDATE: Using D3.js update patterns to preserve connections');
    }

    // Get or create main group for zooming
    let g = svg.select('.graph-container');
    if (g.empty()) {
      g = svg.append('g').attr('class', 'graph-container');
    }

    // Initialize or update simulation
    const centerX = width / 2;
    const centerY = height / 2;
    
    let simulation = simulationRef.current;
    
    if (!simulation || isFirstRender) {
      console.log('🎯 CREATING NEW SIMULATION');
      // STABILITY FIX: Dramatically reduce force strengths to eliminate chaotic bouncing
      simulation = d3.forceSimulation<GraphNode>(data.nodes)
        .force('link', d3.forceLink<GraphNode, GraphEdge>(data.edges)
          .id((d) => d.id)
          .distance(d => {
            // Moderate hierarchical distance based on relationship type
            if (d.type === 'contains') return 120; // Reduced parent-child distance
            return 80 + (d.weight || 1) * 15;     // Reduced overall distances
          })
          .strength(0.2) // Reduced from 0.4 to 0.2 for gentler links
        )
        .force('charge', d3.forceManyBody()
          .strength(d => {
            // CRITICAL FIX: Dramatically reduced charge strength (was -1200, now -300)
            const baseStrength = -300; // 75% reduction eliminates violent repulsion
            const sizeMultiplier = (d.size || 20) / 20;
            return baseStrength * sizeMultiplier;
          })
          .distanceMax(400) // Reduced from 600 for more contained forces
        )
        .force('center', d3.forceCenter(centerX, centerY))
        .force('collision', d3.forceCollide()
          .radius(d => (d.size || 20) + 10) // Reduced collision padding
          .strength(0.6) // Reduced from 0.8 for smoother interactions
        )
        .force('radial', d3.forceRadial(
          (d) => {
            // Gentler radial positioning based on hierarchy level
            const level = d.level || 0;
            return level === 0 ? 0 : 80 + (level * 60); // Reduced radial distances
          },
          centerX,
          centerY
        ).strength(0.15)) // Reduced from 0.3 for subtle hierarchy
        .velocityDecay(0.6) // ADD DAMPING: Critical for simulation stability
        .alphaDecay(0.02);  // ADD COOLING: Slower cooling for smooth settling

      simulationRef.current = simulation;
    } else {
      console.log('🔄 UPDATING EXISTING SIMULATION');
      // Update simulation with new data using D3.js update pattern
      simulation.nodes(data.nodes);
      const linkForce = simulation.force('link') as d3.ForceLink<GraphNode, GraphEdge>;
      if (linkForce) {
        linkForce.links(data.edges);
      }
      simulation.alpha(0.3).restart(); // Gentle restart to incorporate new nodes/edges
    }

    // CRITICAL TOPOLOGY FIX: Use D3.js enter/update/exit pattern for edges
    const edgesContainer = g.select('.edges').empty() ? g.append('g').attr('class', 'edges') : g.select('.edges');
    
    const link = edgesContainer
      .selectAll('line')
      .data(data.edges, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`);
    
    // CRITICAL FIX: Properly remove edges that no longer exist with cleanup
    link.exit()
      .transition()
      .duration(200)
      .attr('stroke-opacity', 0)
      .remove();
    
    // ENTER: Add new edges
    const linkEnter = link.enter()
      .append('line')
      .attr('stroke', d => {
        switch (d.type) {
          case 'calls': return '#ef4444';      // Red
          case 'imports': return '#3b82f6';    // Blue
          case 'inherits': return '#10b981';   // Green
          case 'references': return '#f59e0b'; // Orange
          case 'contains': return '#00d4ff';   // Cyan for hierarchy
          default: return '#6b7280';
        }
      })
      .attr('stroke-width', d => {
        if (d.type === 'contains') return 3; // Thicker for hierarchy
        return Math.max(2, d.weight * 2);
      })
      .attr('stroke-opacity', d => d.type === 'contains' ? 0.8 : 0.6)
      .attr('filter', isVeryHighNodeCount ? 'none' : 'url(#neon-glow)')
      .attr('marker-end', d => `url(#arrowhead-${d.type})`)
      .attr('stroke-dasharray', d => d.type === 'contains' ? '8,4' : 'none')
      .attr('data-type', d => d.type);

    // MERGE: Combine enter and update selections
    const linkMerged = linkEnter.merge(link);
    
    // UPDATE: Update properties for all edges
    linkMerged
      .attr('stroke', d => {
        switch (d.type) {
          case 'calls': return '#ef4444';
          case 'imports': return '#3b82f6';
          case 'inherits': return '#10b981';
          case 'references': return '#f59e0b';
          case 'contains': return '#00d4ff';
          default: return '#6b7280';
        }
      })
      .attr('stroke-width', d => {
        if (d.type === 'contains') return 3;
        return Math.max(2, d.weight * 2);
      })
      .attr('stroke-opacity', d => d.type === 'contains' ? 0.8 : 0.6);

    // CRITICAL TOPOLOGY FIX: Use D3.js enter/update/exit pattern for nodes
    const nodesContainer = g.select('.nodes').empty() ? g.append('g').attr('class', 'nodes') : g.select('.nodes');
    
    const node = nodesContainer
      .selectAll('g.node')
      .data(data.nodes, (d: any) => d.id);
    
    // CRITICAL FIX: Properly remove nodes that no longer exist with cleanup
    node.exit()
      .transition()
      .duration(200)
      .style('opacity', 0)
      .attr('transform', function(d) {
        // Move removed nodes towards the center during exit
        return `translate(${width/2},${height/2}) scale(0.1)`;
      })
      .remove();
    
    // ENTER: Add new nodes
    const nodeEnter = node.enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (event, d) => {
          // STABILITY FIX: Only restart simulation if it's not already running
          if (!event.active && simulationRef.current && simulationRef.current.alpha() < 0.01) {
            simulation.alphaTarget(0.05).restart(); // Very gentle restart only when needed
          }
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    // Add all node components to ENTER selection
    nodeEnter.append('circle')
      .attr('class', 'node-circle')
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClickRef.current?.(d);
      })
      .on('mouseenter', (event, d) => {
        onNodeHoverRef.current?.(d);
        
        // Enhanced hover effect with transparent center maintained
        const circle = d3.select(event.currentTarget);
        circle
          .transition()
          .duration(200)
          .attr('r', (d.size || 25) * 1.15)
          .attr('stroke-width', 5)
          .attr('fill', () => {
            // Slightly more opaque on hover but still transparent
            const color = d3.color(d.color || '#00d4ff');
            return color ? color.copy({opacity: 0.25}).toString() : 'rgba(0, 212, 255, 0.25)';
          });
          
        console.log('🎯 Hover effect applied without pulsing animation');
      })
      .on('mouseleave', (event, d) => {
        onNodeHoverRef.current?.(null);
        
        const circle = d3.select(event.currentTarget);
        circle
          .transition()
          .duration(200)
          .attr('r', d.size || 25)
          .attr('stroke-width', 3)
          .attr('fill', () => {
            // Return to low opacity transparent fill
            const color = d3.color(d.color || '#00d4ff');
            return color ? color.copy({opacity: 0.15}).toString() : 'rgba(0, 212, 255, 0.15)';
          });
      });

    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('dy', 0)
      .style('font-family', 'Inter, system-ui, sans-serif')
      .style('font-weight', '600')
      .style('fill', '#ffffff')
      .style('text-shadow', '0 0 4px rgba(0,0,0,0.8)')
      .style('pointer-events', 'none');

    nodeEnter.append('rect').attr('class', 'type-badge');
    nodeEnter.append('text').attr('class', 'type-text');

    // Add expansion indicators to expandable nodes
    nodeEnter.filter(d => d.isExpandable)
      .append('circle')
      .attr('class', 'expansion-indicator')
      .attr('r', 8)
      .style('cursor', 'pointer');

    nodeEnter.filter(d => d.isExpandable)
      .append('text')
      .attr('class', 'expansion-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-family', 'Inter, system-ui, sans-serif')
      .style('font-weight', 'bold')
      .style('font-size', '10px')
      .style('fill', '#ffffff')
      .style('pointer-events', 'none');

    // MERGE: Combine enter and update selections
    const nodeMerged = nodeEnter.merge(node);
    
    // UPDATE: Update all node properties (both new and existing nodes)
    nodeMerged.select('.node-circle')
      .attr('r', d => d.size || 25)
      .attr('fill', d => {
        const color = d3.color(d.color || '#00d4ff');
        return color ? color.copy({opacity: 0.15}).toString() : 'rgba(0, 212, 255, 0.15)';
      })
      .attr('stroke', d => d.color || '#00d4ff')
      .attr('stroke-width', 3)
      .attr('filter', isVeryHighNodeCount ? 'none' : 'url(#neon-glow)');

    nodeMerged.select('.node-label')
      .style('font-size', d => {
        const radius = d.size || 25;
        const textLength = d.name.length;
        let fontSize = Math.max(10, Math.min(radius / 3, 14));
        
        if (textLength > 10) fontSize *= 0.8;
        if (textLength > 15) fontSize *= 0.8;
        
        return `${fontSize}px`;
      })
      .text(d => {
        const radius = d.size || 25;
        const maxChars = Math.floor(radius / 4);
        
        if (d.name.length <= maxChars) return d.name;
        if (maxChars < 4) return d.name.substring(0, 2) + '...';
        return d.name.substring(0, maxChars - 3) + '...';
      });

    // Update type badges
    nodeMerged.select('.type-badge')
      .attr('x', d => -(d.type.length * 3))
      .attr('y', d => -(d.size || 25) - 18)
      .attr('width', d => d.type.length * 6 + 8)
      .attr('height', 14)
      .attr('rx', 7)
      .attr('fill', 'rgba(0, 0, 0, 0.7)')
      .attr('stroke', d => d.color || '#00d4ff')
      .attr('stroke-width', 1);

    nodeMerged.select('.type-text')
      .attr('y', d => -(d.size || 25) - 11)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .style('font-family', 'Inter, system-ui, sans-serif')
      .style('font-size', '9px')
      .style('font-weight', '500')
      .style('fill', '#ffffff')
      .style('pointer-events', 'none')
      .text(d => d.type.toUpperCase());

    // Update expansion indicators
    nodeMerged.select('.expansion-indicator')
      .attr('cx', d => (d.size || 25) * 0.7)
      .attr('cy', d => -(d.size || 25) * 0.7)
      .attr('fill', d => d.isExpanded ? '#ef4444' : '#00d4ff')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2);

    nodeMerged.select('.expansion-icon')
      .attr('x', d => (d.size || 25) * 0.7)
      .attr('y', d => -(d.size || 25) * 0.7)
      .text(d => d.isExpanded ? '−' : '+');

    // REMOVED: Edge labels for cleaner visualization
    let edgeLabels = g.select('.edge-labels');
    if (edgeLabels.empty()) {
      edgeLabels = g.append('g')
        .attr('class', 'edge-labels')
        .style('display', 'none'); // Hide all edge labels
    }

    // CRITICAL TOPOLOGY FIX: Update tick function to use merged selections
    simulation.on('tick', () => {
      linkMerged
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);

      nodeMerged
        .attr('transform', d => `translate(${d.x},${d.y})`);

      // Edge labels are disabled for cleaner visualization
    });

    // Apply zoom behavior only on first render
    if (isFirstRender) {
      console.log('🎯 SETTING UP ZOOM BEHAVIOR');
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 3])
        .on('start', () => {
          if (simulationRef.current) {
            simulationRef.current.alphaTarget(0);
          }
        })
        .on('zoom', (event) => {
          g.transition()
            .duration(100)
            .attr('transform', event.transform);
          
          const scale = event.transform.k;
          edgeLabels
            .transition()
            .duration(150)
            .style('opacity', scale > 0.6 ? 1 : 0);
          
          linkMerged.transition()
            .duration(100)
            .attr('stroke-width', d => {
              const baseWidth = d.type === 'contains' ? 3 : Math.max(2, d.weight * 2);
              return Math.max(1, baseWidth / Math.sqrt(scale) * 0.9);
            });
        })
        .on('end', () => {
          console.log('🔍 Zoom ended - not restarting simulation to prevent constant refreshing');
        });

      svg.call(zoom);
      
      // Apply initial zoom level
      svg.transition()
        .duration(300)
        .call(zoom.transform, d3.zoomIdentity.scale(zoomLevel));
    }

    // Add hover effects to links (only on first render to avoid duplicate listeners)
    if (isFirstRender) {
      linkMerged
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke-opacity', 1)
            .attr('stroke-width', (d.type === 'contains' ? 5 : Math.max(4, d.weight * 3)));
        })
        .on('mouseleave', function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke-opacity', d.type === 'contains' ? 0.8 : 0.6)
            .attr('stroke-width', d.type === 'contains' ? 3 : Math.max(2, d.weight * 2));
        });
    }

    console.log('🎯 TOPOLOGY FIX COMPLETE: Using D3.js update patterns to preserve edge connections');
    return simulation;
  }, [data, width, height, zoomLevel]); // STABILITY FIX: Removed onNodeClick, onNodeHover from deps

  // Initialize simulation when component mounts or data changes
  useEffect(() => {
    const simulation = initializeSimulation();
    return () => {
      simulation?.stop();
    };
  }, [initializeSimulation]);

  // Control simulation running state
  useEffect(() => {
    if (simulationRef.current) {
      if (simulationRunning) {
        simulationRef.current.alpha(0.1).restart(); // STABILITY FIX: Reduced from 0.3 to 0.1
      } else {
        simulationRef.current.stop();
      }
    }
  }, [simulationRunning]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="knowledge-graph-d3"
      style={{ background: 'transparent' }}
    />
  );
};