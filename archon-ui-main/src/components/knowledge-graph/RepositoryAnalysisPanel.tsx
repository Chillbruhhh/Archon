import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  BarChart3, 
  Code, 
  FileText, 
  GitBranch,
  Clock,
  TrendingUp,
  Users,
  Zap,
  Network,
  Eye,
  Download,
  Settings,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { RepositoryInfo } from '../../services/knowledgeGraphService';

interface AnalysisMetrics {
  complexity: {
    average: number;
    highest: string;
    distribution: Record<string, number>;
  };
  dependencies: {
    total: number;
    circular: number;
    external: number;
    internal: number;
  };
  coverage: {
    functions: number;
    classes: number;
    modules: number;
    relationships: number;
  };
  patterns: {
    design_patterns: string[];
    anti_patterns: string[];
    recommendations: string[];
  };
}

interface RepositoryAnalysisPanelProps {
  repository: RepositoryInfo;
  onClose: () => void;
}

export const RepositoryAnalysisPanel: React.FC<RepositoryAnalysisPanelProps> = ({
  repository,
  onClose
}) => {
  const [analysis, setAnalysis] = useState<AnalysisMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'patterns' | 'export'>('overview');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  // Load analysis data
  useEffect(() => {
    loadAnalysis();
  }, [repository.id]);

  const loadAnalysis = async () => {
    try {
      setLoading(true);
      
      // Mock analysis data - in real implementation, this would fetch from the API
      const mockAnalysis: AnalysisMetrics = {
        complexity: {
          average: 7.3,
          highest: 'DatabaseService.connect() - 15.2',
          distribution: {
            'Low (1-5)': 45,
            'Medium (6-10)': 32,
            'High (11-15)': 18,
            'Very High (16+)': 5
          }
        },
        dependencies: {
          total: 127,
          circular: 3,
          external: 42,
          internal: 85
        },
        coverage: {
          functions: 89,
          classes: 94,
          modules: 100,
          relationships: 76
        },
        patterns: {
          design_patterns: ['Factory Pattern', 'Observer Pattern', 'Singleton Pattern'],
          anti_patterns: ['God Object', 'Tight Coupling in AuthService'],
          recommendations: [
            'Extract common utilities into shared module',
            'Implement dependency injection for better testability',
            'Break down large classes (>500 lines)',
            'Add interface abstractions for external dependencies'
          ]
        }
      };

      setTimeout(() => {
        setAnalysis(mockAnalysis);
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to load analysis:', error);
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const exportAnalysis = () => {
    if (!analysis) return;
    
    const data = {
      repository: repository.name,
      timestamp: new Date().toISOString(),
      analysis
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${repository.name}-analysis.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 },
    { id: 'patterns', label: 'Patterns', icon: Network },
    { id: 'export', label: 'Export', icon: Download }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full"
    >
      <Card accentColor="cyan" variant="bordered" className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                Repository Analysis
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 text-xs">
                  {repository.name}
                </Badge>
                {repository.repository_url && (
                  <a
                    href={repository.repository_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              icon={<X className="w-4 h-4" />}
            />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin w-6 h-6 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Analyzing repository...</p>
              </div>
            </div>
          ) : !analysis ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Failed to load analysis</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Basic Info */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Total Files</span>
                      <span className="font-medium">{repository.total_files.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Parsed Files</span>
                      <span className="font-medium">{repository.parsed_files.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Languages</span>
                      <span className="font-medium">{repository.all_languages.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Primary Language</span>
                      <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs">
                        {repository.primary_language}
                      </Badge>
                    </div>
                  </div>

                  {/* Coverage Summary */}
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      Analysis Coverage
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Functions</span>
                          <span className="font-medium">{analysis.coverage.functions}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${analysis.coverage.functions}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Classes</span>
                          <span className="font-medium">{analysis.coverage.classes}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${analysis.coverage.classes}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Modules</span>
                          <span className="font-medium">{analysis.coverage.modules}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${analysis.coverage.modules}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Relations</span>
                          <span className="font-medium">{analysis.coverage.relationships}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-orange-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${analysis.coverage.relationships}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <Card className="p-3 text-center">
                      <div className="text-lg font-bold text-cyan-600 dark:text-cyan-400">
                        {analysis.complexity.average}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Avg Complexity
                      </div>
                    </Card>
                    <Card className="p-3 text-center">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        {analysis.dependencies.total}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Dependencies
                      </div>
                    </Card>
                  </div>
                </motion.div>
              )}

              {activeTab === 'metrics' && (
                <motion.div
                  key="metrics"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Complexity Analysis */}
                  <div>
                    <button
                      onClick={() => toggleSection('complexity')}
                      className="flex items-center gap-2 w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                    >
                      {expandedSections.has('complexity') ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="font-medium">Code Complexity</span>
                    </button>
                    
                    {expandedSections.has('complexity') && (
                      <div className="pl-6 space-y-3">
                        <div className="text-sm">
                          <div className="flex justify-between mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Average</span>
                            <span className="font-medium">{analysis.complexity.average}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            Highest: {analysis.complexity.highest}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          {Object.entries(analysis.complexity.distribution).map(([range, count]) => (
                            <div key={range} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 dark:text-gray-400">{range}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                  <div 
                                    className="bg-gradient-to-r from-green-500 to-red-500 h-1.5 rounded-full"
                                    style={{ width: `${count}%` }}
                                  />
                                </div>
                                <span className="font-medium w-8 text-right">{count}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dependencies */}
                  <div>
                    <button
                      onClick={() => toggleSection('dependencies')}
                      className="flex items-center gap-2 w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
                    >
                      {expandedSections.has('dependencies') ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="font-medium">Dependencies</span>
                    </button>
                    
                    {expandedSections.has('dependencies') && (
                      <div className="pl-6 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Total</span>
                          <span className="font-medium">{analysis.dependencies.total}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">External</span>
                          <span className="font-medium">{analysis.dependencies.external}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Internal</span>
                          <span className="font-medium">{analysis.dependencies.internal}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-red-600 dark:text-red-400">Circular</span>
                          <span className="font-medium text-red-600 dark:text-red-400">
                            {analysis.dependencies.circular}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'patterns' && (
                <motion.div
                  key="patterns"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Design Patterns */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-green-600 dark:text-green-400">
                      Design Patterns Found
                    </h4>
                    <div className="space-y-1">
                      {analysis.patterns.design_patterns.map(pattern => (
                        <Badge key={pattern} className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs mr-2">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Anti-patterns */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-red-600 dark:text-red-400">
                      Anti-patterns Detected
                    </h4>
                    <div className="space-y-1">
                      {analysis.patterns.anti_patterns.map(pattern => (
                        <Badge key={pattern} className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs mr-2">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-blue-600 dark:text-blue-400">
                      Recommendations
                    </h4>
                    <div className="space-y-2">
                      {analysis.patterns.recommendations.map((rec, index) => (
                        <div key={index} className="flex items-start gap-2 text-sm p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                          <Zap className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span className="text-blue-800 dark:text-blue-200">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'export' && (
                <motion.div
                  key="export"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="text-center py-8">
                    <Download className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h4 className="font-medium text-lg mb-2">Export Analysis</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                      Download the complete analysis report for this repository
                    </p>
                    
                    <div className="space-y-3">
                      <Button
                        onClick={exportAnalysis}
                        icon={<Download className="w-4 h-4" />}
                        accentColor="cyan"
                        className="w-full"
                      >
                        Download JSON Report
                      </Button>
                      
                      <Button
                        variant="outline"
                        icon={<FileText className="w-4 h-4" />}
                        className="w-full"
                        disabled
                      >
                        Generate PDF Report (Coming Soon)
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </Card>
    </motion.div>
  );
};