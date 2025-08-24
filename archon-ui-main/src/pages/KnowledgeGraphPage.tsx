import { useEffect, useState, useRef } from 'react';
import { 
  Plus, 
  Brain,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useStaggeredEntrance } from '../hooks/useStaggeredEntrance';
import { 
  knowledgeGraphService, 
  RepositoryInfo, 
  ParseRepositoryRequest,
  ParsingProgress 
} from '../services/knowledgeGraphService';
import { KnowledgeGraphVisualization } from '../components/knowledge-graph/KnowledgeGraphVisualization';
import { RepositoryGraphCard } from '../components/knowledge-graph/RepositoryGraphCard';
import { ParseRepositoryModal } from '../components/knowledge-graph/ParseRepositoryModal';
import { ParsingProgressCard } from '../components/knowledge-graph/ParsingProgressCard';
import { RepositoryGraphGridSkeleton } from '../components/knowledge-graph/RepositoryGraphSkeleton';

export const KnowledgeGraphPage = () => {
  // State management
  const [repositories, setRepositories] = useState<RepositoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<RepositoryInfo | null>(null);
  const [showParseModal, setShowParseModal] = useState(false);
  const [parsingProgress, setParsingProgress] = useState<Map<string, ParsingProgress>>(new Map());
  const [activeTab, setActiveTab] = useState<'knowledge' | 'graph'>('knowledge');

  // Hooks
  const { showToast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  // Staggered entrance animations for repositories
  const {
    isVisible,
    containerVariants: repositoryContainerVariants,
    itemVariants: repositoryItemVariants
  } = useStaggeredEntrance(repositories, 0.15);

  // Load repositories
  useEffect(() => {
    loadRepositories();
  }, []);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      const response = await knowledgeGraphService.listRepositories(
        1,
        20
      );

      if (response.success) {
        setRepositories(response.data.repositories || []);
        setError(null);
      } else {
        throw new Error(response.error || 'Failed to load repositories');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load repositories';
      setError(errorMessage);
      setRepositories([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle repository parsing
  const handleParseRepository = async (request: ParseRepositoryRequest) => {
    try {
      const response = await knowledgeGraphService.parseRepository(request);
      
      if (response.success) {
        showToast(`Repository "${request.name}" parsing has started. You can track progress below.`, 'success');

        // Add initial parsing progress
        const initialProgress: ParsingProgress = {
          parsingId: response.parsing_id,
          status: 'starting',
          message: 'Initializing repository parsing...',
          timestamp: new Date().toISOString(),
          repositoryName: request.name,
          repositoryUrl: request.repository_url,
          percentage: 0
        };

        setParsingProgress(prev => new Map(prev.set(response.parsing_id, initialProgress)));

        // Start real-time progress tracking
        await startProgressTracking(response.parsing_id, request.name);

        setShowParseModal(false);
        
        // Refresh repositories after a delay to show the new one
        setTimeout(() => {
          loadRepositories();
        }, 2000);
      } else {
        throw new Error(response.error || 'Failed to start parsing');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start parsing';
      showToast(errorMessage, 'error');
    }
  };

  // Start progress tracking for a parsing operation
  const startProgressTracking = async (parsingId: string, repositoryName: string) => {
    try {
      const { knowledgeGraphProgressService } = await import('../services/knowledgeGraphProgressService');
      
      await knowledgeGraphProgressService.streamProgress(
        parsingId,
        (progressData) => {
          setParsingProgress(prev => {
            const newMap = new Map(prev);
            newMap.set(parsingId, {
              ...progressData,
              repositoryName,
            });
            return newMap;
          });

          // Auto-remove completed/failed progress after 5 seconds
          if (progressData.status === 'completed' || progressData.status === 'failed' || progressData.status === 'error') {
            setTimeout(() => {
              setParsingProgress(prev => {
                const newMap = new Map(prev);
                newMap.delete(parsingId);
                return newMap;
              });
              
              // Refresh repositories list to show the new parsed repository
              if (progressData.status === 'completed') {
                loadRepositories();
              }
            }, 5000); // Keep completed/failed status visible for 5 seconds
          }
        }
      );
    } catch (err) {
      console.error(`Failed to start progress tracking for ${parsingId}:`, err);
      showToast('Unable to track parsing progress in real-time.', 'warning');
    }
  };

  // Handle repository deletion
  const handleDeleteRepository = async (repository: RepositoryInfo) => {
    try {
      const response = await knowledgeGraphService.deleteRepository(repository.id);
      
      if (response.success) {
        showToast(`Repository "${repository.name}" has been deleted successfully.`, 'success');
        
        // Remove from local state
        setRepositories(prev => prev.filter(r => r.id !== repository.id));
        
        // Clear selection if deleted repository was selected
        if (selectedRepository?.id === repository.id) {
          setSelectedRepository(null);
        }
      } else {
        throw new Error(response.error || 'Failed to delete repository');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete repository';
      showToast(errorMessage, 'error');
    }
  };

  // Handle parsing cancellation
  const handleCancelParsing = async (parsingId: string) => {
    try {
      const response = await knowledgeGraphService.cancelParsing(parsingId);
      
      if (response.success) {
        showToast('Repository parsing has been cancelled successfully.', 'success');
        
        // Stop progress tracking
        const { knowledgeGraphProgressService } = await import('../services/knowledgeGraphProgressService');
        knowledgeGraphProgressService.stopStreaming(parsingId);
        
        // Remove from parsing progress
        setParsingProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(parsingId);
          return newMap;
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel parsing';
      showToast(errorMessage, 'error');
    }
  };

  // Switch to graph view when repository is selected
  const handleRepositorySelect = (repository: RepositoryInfo) => {
    setSelectedRepository(repository);
    setActiveTab('graph');
  };

  // Handle repository refresh
  const handleRepositoryRefresh = async (repository: RepositoryInfo) => {
    try {
      showToast(`Refreshing knowledge graph for "${repository.name}"...`, 'info');
      
      // For now, just reload the repositories list
      // In the future, this could trigger a re-parsing of the repository
      await loadRepositories();
      
    } catch (error) {
      console.error('Failed to refresh repository:', error);
      showToast('Failed to refresh repository. Please try again.', 'error');
    }
  };

  // Cleanup progress tracking on unmount
  useEffect(() => {
    return () => {
      // Clean up any active progress tracking when component unmounts
      import('../services/knowledgeGraphProgressService').then(({ knowledgeGraphProgressService }) => {
        knowledgeGraphProgressService.stopAllStreams();
      });
    };
  }, []);

  return (
    <div className="h-screen flex flex-col" ref={containerRef}>
      {/* Header with Tab Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="border-b border-gray-200 dark:border-gray-800"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {selectedRepository && activeTab === 'graph' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveTab('knowledge');
                    setSelectedRepository(null);
                  }}
                  icon={<ArrowLeft className="w-4 h-4" />}
                  className="text-gray-600 dark:text-gray-400"
                >
                  Back
                </Button>
              )}
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  {selectedRepository && activeTab === 'graph' ? selectedRepository.name : 'Knowledge Graph'}
                </h1>
                {selectedRepository && activeTab === 'graph' && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Interactive code visualization • {selectedRepository.total_files?.toLocaleString()} files parsed
                  </p>
                )}
              </div>
            </div>
            
            {activeTab === 'knowledge' && (
              <Button
                onClick={() => setShowParseModal(true)}
                icon={<Plus className="w-4 h-4" />}
                accentColor="cyan"
                size="sm"
              >
                Parse Codebase
              </Button>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="relative">
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('knowledge')}
                className={`relative px-6 py-3 font-medium transition-all duration-300 ${
                  activeTab === 'knowledge'
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400/70'
                }`}
              >
                Knowledge
                {activeTab === 'knowledge' && (
                  <span className="absolute bottom-0 left-0 right-0 w-full h-[2px] bg-cyan-500 shadow-[0_0_10px_2px_rgba(34,211,238,0.4)] dark:shadow-[0_0_20px_5px_rgba(34,211,238,0.7)]"></span>
                )}
              </button>
              <button
                onClick={() => selectedRepository ? setActiveTab('graph') : null}
                disabled={!selectedRepository}
                className={`relative px-6 py-3 font-medium transition-all duration-300 ${
                  activeTab === 'graph' && selectedRepository
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : selectedRepository
                      ? 'text-gray-600 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400/70'
                      : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                Graph
                {activeTab === 'graph' && selectedRepository && (
                  <span className="absolute bottom-0 left-0 right-0 w-full h-[2px] bg-cyan-500 shadow-[0_0_10px_2px_rgba(34,211,238,0.4)] dark:shadow-[0_0_20px_5px_rgba(34,211,238,0.7)]"></span>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Active Parsing Progress - Compact */}
      <AnimatePresence>
        {parsingProgress.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 border-b border-gray-200 dark:border-gray-800"
          >
            <div className="grid gap-2">
              {Array.from(parsingProgress.values()).map((progress) => (
                <ParsingProgressCard
                  key={progress.parsingId}
                  progress={progress}
                  onCancel={() => handleCancelParsing(progress.parsingId)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'knowledge' ? (
            <motion.div
              key="knowledge-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="h-full p-4"
            >
              {loading ? (
                <RepositoryGraphGridSkeleton />
              ) : error ? (
                <div className="h-full flex items-center justify-center">
                  <Card accentColor="pink" className="p-8 text-center max-w-md">
                    <div className="text-red-500 mb-4">
                      <Brain className="w-12 h-12 mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Failed to Load Repositories</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                    <Button onClick={loadRepositories} accentColor="pink">
                      Try Again
                    </Button>
                  </Card>
                </div>
              ) : repositories.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <Card accentColor="cyan" className="p-12 text-center max-w-lg">
                    <div className="text-cyan-400 mb-4">
                      <Brain className="w-16 h-16 mx-auto" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No Repositories Found</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Get started by parsing your first repository to build a knowledge graph.
                    </p>
                    <Button
                      onClick={() => setShowParseModal(true)}
                      icon={<Plus className="w-4 h-4" />}
                      accentColor="cyan"
                    >
                      Parse Codebase
                    </Button>
                  </Card>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`repositories-${repositories.length}`}
                    initial="hidden"
                    animate={isVisible ? 'visible' : 'hidden'}
                    variants={repositoryContainerVariants}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {repositories.map((repository, index) => (
                      <motion.div
                        key={repository.id}
                        variants={repositoryItemVariants}
                      >
                        <RepositoryGraphCard
                          repository={repository}
                          index={index}
                          onDelete={() => handleDeleteRepository(repository)}
                          onSelect={() => handleRepositorySelect(repository)}
                          onRefresh={() => handleRepositoryRefresh(repository)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="graph-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {selectedRepository ? (
                <div 
                  className="h-full relative"
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(2px)'
                  }}
                >
                  <KnowledgeGraphVisualization
                    repository={selectedRepository}
                    onNodeSelect={(node) => console.log('Selected node:', node)}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <Card accentColor="cyan" className="p-8 text-center">
                    <p className="text-gray-600 dark:text-gray-400">
                      Select a repository from the Knowledge tab to view its graph.
                    </p>
                  </Card>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <ParseRepositoryModal
        isOpen={showParseModal}
        onClose={() => setShowParseModal(false)}
        onParse={handleParseRepository}
        supportedLanguages={[]}
      />
    </div>
  );
};