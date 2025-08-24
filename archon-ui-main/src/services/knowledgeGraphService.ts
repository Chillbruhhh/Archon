/**
 * Knowledge Graph service for managing code repositories and graph operations
 */

import { API_BASE_URL } from '../config/api';

// Types for Knowledge Graph operations
export interface ParseRepositoryRequest {
  name: string;
  repository_url?: string;
  local_path?: string;
  branch_name?: string;
  archon_source_id?: string;
  archon_project_id?: string;
  languages?: string[];
  max_file_size_kb?: number;
  enable_cross_file_refs?: boolean;
}

export interface ParseRepositoryResponse {
  success: boolean;
  parsing_id: string;
  message: string;
  estimated_duration?: string;
  error?: string;
}

export interface GraphQueryRequest {
  repository_id: string;
  start_node_id?: string;
  end_node_id?: string;
  relationship_types?: string[];
  max_depth?: number;
  node_types?: string[];
  language_filter?: string;
  include_properties?: boolean;
}

export interface GraphNode {
  id: string;
  kg_repository_id: string;
  node_type: string;
  name: string;
  fully_qualified_name?: string;
  file_path: string;
  line_start?: number;
  line_end?: number;
  column_start?: number;
  column_end?: number;
  language: string;
  properties?: Record<string, any>;
  source_code?: string;
  docstring?: string;
  complexity_score?: number;
  is_public: boolean;
  is_exported: boolean;
  created_at?: string;
}

export interface GraphRelationship {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  confidence_score: number;
  call_count?: number;
  is_direct: boolean;
  context_info?: Record<string, any>;
  created_at?: string;
}

export interface GraphQueryResponse {
  success: boolean;
  data: {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    total_nodes: number;
    total_relationships: number;
    query_parameters: Record<string, any>;
  };
  error?: string;
}

export interface GraphStatistics {
  total_nodes: number;
  total_relationships: number;
  nodes_by_type: Record<string, number>;
  relationships_by_type: Record<string, number>;
  languages: Record<string, number>;
  complexity_stats?: Record<string, number>;
}

export interface GraphStatisticsResponse {
  success: boolean;
  data: GraphStatistics;
  error?: string;
}

export interface RepositoryInfo {
  id: string;
  name: string;
  repository_url?: string;
  local_path?: string;
  branch_name: string;
  primary_language?: string;
  all_languages: string[];
  total_files: number;
  parsed_files: number;
  parsing_duration_seconds?: number;
  created_at: string;
  updated_at: string;
  // Knowledge Graph specific fields
  total_nodes?: number;
  total_relationships?: number;
  node_types?: string[];
  relationship_types?: string[];
  avg_complexity?: number;
}

export interface RepositoryListResponse {
  success: boolean;
  data: {
    repositories: RepositoryInfo[];
    pagination: {
      page: number;
      per_page: number;
      total: number;
      pages: number;
    };
  };
  error?: string;
}

export interface RepositoryDetailsResponse {
  success: boolean;
  data: {
    repository: RepositoryInfo;
    statistics: GraphStatistics;
  };
  error?: string;
}

export interface AnalysisRequest {
  repository_id: string;
  analysis_type: 'dependency_tree' | 'complexity_analysis' | 'hotspots' | 'architecture_overview';
  parameters?: Record<string, any>;
}

export interface AnalysisResult {
  analysis_id: string;
  analysis_type: string;
  results: Record<string, any>;
  execution_time_ms: number;
  created_at: string;
}

export interface AnalysisResponse {
  success: boolean;
  data: AnalysisResult;
  error?: string;
}

export interface LanguageConfig {
  language: string;
  file_extensions: string[];
  supported_node_types: string[];
  complexity_enabled: boolean;
}

export interface SupportedLanguagesResponse {
  success: boolean;
  data: {
    languages: LanguageConfig[];
    total_languages: number;
  };
  error?: string;
}

export interface ParsingProgress {
  parsingId: string;
  status: 'starting' | 'cloning' | 'parsing' | 'analyzing' | 'processing' | 'completed' | 'error' | 'failed' | 'cancelled';
  message: string;
  total_files?: number;
  processed_files?: number;
  current_file?: string;
  nodes_created?: number;
  relationships_created?: number;
  errors?: string[];
  timestamp: string;
  estimated_duration?: string;
  kg_source_id?: string;
  kg_repository_id?: string;
  statistics?: Record<string, any>;
  // Additional fields for UI display
  repositoryName?: string;
  repositoryUrl?: string;
  percentage?: number;
}

// Helper function for API requests with timeout
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`🧠 [KnowledgeGraph] Starting API request to: ${url}`);
  console.log(`🧠 [KnowledgeGraph] Request method: ${options.method || 'GET'}`);
  
  // Create an AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`⏰ [KnowledgeGraph] Request timeout after 300 seconds (5 minutes) for: ${url}`);
    controller.abort();
  }, 300000); // 300 second (5 minute) timeout for long parsing operations
  
  try {
    console.log(`🚀 [KnowledgeGraph] Sending fetch request...`);
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log(`✅ [KnowledgeGraph] Response received:`, response.status, response.statusText);

    if (!response.ok) {
      console.error(`❌ [KnowledgeGraph] Response not OK: ${response.status} ${response.statusText}`);
      const error = await response.json();
      console.error(`❌ [KnowledgeGraph] API error response:`, error);
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ [KnowledgeGraph] Response data received, type: ${typeof data}`);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`❌ [KnowledgeGraph] Request failed:`, error);
    
    // Check if it's a timeout error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out after 300 seconds (5 minutes)');
    }
    
    throw error;
  }
}

class KnowledgeGraphService {
  /**
   * Parse a repository and build its knowledge graph
   */
  async parseRepository(request: ParseRepositoryRequest): Promise<ParseRepositoryResponse> {
    console.log('🧠 [KnowledgeGraph] Starting repository parsing:', request);
    
    const response = await apiRequest<ParseRepositoryResponse>('/knowledge-graph/parse', {
      method: 'POST',
      body: JSON.stringify(request)
    });
    
    console.log('🧠 [KnowledgeGraph] Parse response received:', response);
    return response;
  }

  /**
   * Query the knowledge graph for nodes and relationships
   */
  async queryGraph(request: GraphQueryRequest): Promise<GraphQueryResponse> {
    console.log('🔍 [KnowledgeGraph] Querying graph:', request);
    
    const response = await apiRequest<GraphQueryResponse>('/knowledge-graph/query', {
      method: 'POST',
      body: JSON.stringify(request)
    });
    
    console.log('🔍 [KnowledgeGraph] Query response received:', response);
    return response;
  }

  /**
   * Get comprehensive statistics for a repository's knowledge graph
   */
  async getStatistics(repository_id: string): Promise<GraphStatisticsResponse> {
    console.log('📊 [KnowledgeGraph] Getting statistics for repository:', repository_id);
    
    const response = await apiRequest<GraphStatisticsResponse>(`/knowledge-graph/statistics/${repository_id}`);
    
    console.log('📊 [KnowledgeGraph] Statistics response received:', response);
    return response;
  }

  /**
   * Perform advanced analysis on a repository's knowledge graph
   */
  async analyzeRepository(request: AnalysisRequest): Promise<AnalysisResponse> {
    console.log('🔬 [KnowledgeGraph] Starting repository analysis:', request);
    
    const response = await apiRequest<AnalysisResponse>('/knowledge-graph/analyze', {
      method: 'POST',
      body: JSON.stringify(request)
    });
    
    console.log('🔬 [KnowledgeGraph] Analysis response received:', response);
    return response;
  }

  /**
   * List all parsed repositories with optional filtering
   */
  async listRepositories(
    page = 1,
    per_page = 20,
    language?: string
  ): Promise<RepositoryListResponse> {
    console.log(`📋 [KnowledgeGraph] Listing repositories: page=${page}, per_page=${per_page}, language=${language}`);
    
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('per_page', String(per_page));
    if (language) {
      params.append('language', language);
    }
    
    const response = await apiRequest<RepositoryListResponse>(`/knowledge-graph/repositories?${params}`);
    
    console.log('📋 [KnowledgeGraph] Repositories list received:', response);
    return response;
  }

  /**
   * Get detailed information about a specific repository
   */
  async getRepository(repository_id: string): Promise<RepositoryDetailsResponse> {
    console.log('📄 [KnowledgeGraph] Getting repository details:', repository_id);
    
    const response = await apiRequest<RepositoryDetailsResponse>(`/knowledge-graph/repositories/${repository_id}`);
    
    console.log('📄 [KnowledgeGraph] Repository details received:', response);
    return response;
  }

  /**
   * Delete a repository and all its associated knowledge graph data
   */
  async deleteRepository(repository_id: string): Promise<{ success: boolean; message: string; error?: string }> {
    console.log('🗑️ [KnowledgeGraph] Deleting repository:', repository_id);
    
    const response = await apiRequest<{ success: boolean; message: string; error?: string }>(`/knowledge-graph/repositories/${repository_id}`, {
      method: 'DELETE'
    });
    
    console.log('🗑️ [KnowledgeGraph] Delete response received:', response);
    return response;
  }

  /**
   * Cancel an active repository parsing operation
   */
  async cancelParsing(parsing_id: string): Promise<{ success: boolean; message: string; error?: string }> {
    console.log('🛑 [KnowledgeGraph] Cancelling parsing:', parsing_id);
    
    const response = await apiRequest<{ success: boolean; message: string; error?: string }>(`/knowledge-graph/parsing/${parsing_id}/cancel`, {
      method: 'POST'
    });
    
    console.log('🛑 [KnowledgeGraph] Cancel response received:', response);
    return response;
  }

  /**
   * Get list of supported programming languages for parsing
   */
  async getSupportedLanguages(): Promise<SupportedLanguagesResponse> {
    console.log('🔤 [KnowledgeGraph] Getting supported languages');
    
    const response = await apiRequest<SupportedLanguagesResponse>('/knowledge-graph/languages');
    
    console.log('🔤 [KnowledgeGraph] Languages response received:', response);
    return response;
  }

  /**
   * Test Socket.IO functionality for Knowledge Graph parsing
   */
  async testSocketProgress(parsing_id: string): Promise<{ success: boolean; message: string; data: any; error?: string }> {
    console.log('🧪 [KnowledgeGraph] Testing socket progress:', parsing_id);
    
    const response = await apiRequest<{ success: boolean; message: string; data: any; error?: string }>(`/knowledge-graph/socket-test/${parsing_id}`);
    
    console.log('🧪 [KnowledgeGraph] Socket test response received:', response);
    return response;
  }

  /**
   * Health check for Knowledge Graph API
   */
  async healthCheck(): Promise<{ status: string; service: string; timestamp: string; features: string[] }> {
    console.log('❤️ [KnowledgeGraph] Performing health check');
    
    const response = await apiRequest<{ status: string; service: string; timestamp: string; features: string[] }>('/knowledge-graph/health');
    
    console.log('❤️ [KnowledgeGraph] Health check response received:', response);
    return response;
  }

  /**
   * Find specific code patterns and anti-patterns using MCP tools
   * This is a convenience method that would use MCP in a real implementation
   */
  findCodePatterns(
    repository_id: string,
    pattern_type: 'circular_dependencies' | 'god_classes' | 'long_methods' | 'tight_coupling' | 'dead_code',
    language?: string,
    complexity_threshold = 5
  ): Promise<AnalysisResponse> {
    // This would typically call MCP tools, but for now we'll use the analysis endpoint
    console.log(`🔍 [KnowledgeGraph] Finding code patterns: ${pattern_type} in repository ${repository_id}`);
    
    return this.analyzeRepository({
      repository_id,
      analysis_type: 'hotspots', // Use hotspots analysis to find patterns
      parameters: {
        pattern_type,
        language,
        complexity_threshold
      }
    });
  }

  /**
   * Get graph visualization data optimized for frontend rendering
   */
  async getVisualizationData(
    repository_id: string,
    max_nodes = 100,
    language_filter?: string
  ): Promise<{ nodes: any[]; links: any[]; stats: GraphStatistics }> {
    console.log(`📊 [KnowledgeGraph] Getting visualization data for repository ${repository_id}`);
    
    // Query graph with limited nodes for visualization
    const graphResponse = await this.queryGraph({
      repository_id,
      max_depth: 2,
      node_types: ['class', 'function', 'method', 'file'],
      relationship_types: ['calls', 'imports', 'contains'],
      language_filter,
      include_properties: false
    });

    // Get statistics
    const statsResponse = await this.getStatistics(repository_id);

    if (!graphResponse.success || !statsResponse.success) {
      throw new Error('Failed to get visualization data');
    }

    // Transform data for D3.js or other visualization libraries
    const nodes = graphResponse.data.nodes.slice(0, max_nodes).map(node => ({
      id: node.id,
      name: node.name,
      type: node.node_type,
      language: node.language,
      file_path: node.file_path,
      complexity: node.complexity_score || 1,
      is_public: node.is_public,
      group: node.language || 'unknown'
    }));

    const nodeIds = new Set(nodes.map(n => n.id));
    const links = graphResponse.data.relationships
      .filter(rel => nodeIds.has(rel.source_node_id) && nodeIds.has(rel.target_node_id))
      .map(rel => ({
        source: rel.source_node_id,
        target: rel.target_node_id,
        type: rel.relationship_type,
        confidence: rel.confidence_score,
        strength: rel.confidence_score
      }));

    console.log(`📊 [KnowledgeGraph] Visualization data prepared: ${nodes.length} nodes, ${links.length} links`);

    return {
      nodes,
      links,
      stats: statsResponse.data
    };
  }
}

// Export singleton instance
export const knowledgeGraphService = new KnowledgeGraphService();