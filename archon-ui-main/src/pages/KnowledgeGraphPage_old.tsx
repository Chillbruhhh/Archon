import { useEffect, useState, useRef } from 'react';
import { 
  Plus, 
  Brain,
  Network,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { 
  knowledgeGraphService, 
  RepositoryInfo, 
  ParseRepositoryRequest,
  ParsingProgress 
} from '../services/knowledgeGraphService';
import { KnowledgeGraphVisualization } from '../components/knowledge-graph/KnowledgeGraphVisualization';
import { RepositoryCard } from '../components/knowledge-graph/RepositoryCard';
import { ParseRepositoryModal } from '../components/knowledge-graph/ParseRepositoryModal';
import { ParsingProgressCard } from '../components/knowledge-graph/ParsingProgressCard';

export const KnowledgeGraphPage = () => {
  // State management
  const [repositories, setRepositories] = useState<RepositoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<RepositoryInfo | null>(null);
  const [showParseModal, setShowParseModal] = useState(false);
  const [parsingProgress, setParsingProgress] = useState<Map<string, ParsingProgress>>(new Map());

  // Hooks
  const { showToast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

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
        setRepositories(response.data.repositories);
        setTotalPages(response.data.pagination.pages);
      } else {
        throw new Error(response.error || 'Failed to load repositories');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load repositories';
      setError(errorMessage);
      showToast({
        title: 'Error Loading Repositories',
        description: errorMessage,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };


  // Handle repository parsing
  const handleParseRepository = async (request: ParseRepositoryRequest) => {
    try {
      const response = await knowledgeGraphService.parseRepository(request);
      
      if (response.success) {
        showToast({
          title: 'Parsing Started',
          description: `Repository "${request.name}" parsing has started. You can track progress below.`,
          type: 'success'
        });

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
      showToast({
        title: 'Parse Failed',
        description: errorMessage,
        type: 'error'
      });
    }
  };

  // Start progress tracking for a parsing operation
  const startProgressTracking = async (parsingId: string, repositoryName: string) => {
    try {
      const { knowledgeGraphProgressService } = await import('../services/knowledgeGraphProgressService');
      
      console.log(`🧠 Starting progress tracking for parsing ${parsingId}`);
      
      await knowledgeGraphProgressService.streamProgress(
        parsingId,
        (progressData) => {
          console.log(`🧠 Progress update received for ${parsingId}:`, progressData);
          
          // Update parsing progress state
          setParsingProgress(prev => {
            const newMap = new Map(prev);
            const existingProgress = newMap.get(parsingId) || {
              parsingId,
              status: 'starting',
              message: '',
              timestamp: new Date().toISOString()
            };

            const updatedProgress: ParsingProgress = {
              ...existingProgress,
              ...progressData,
              parsingId, // Ensure parsingId is always set
              repositoryName: existingProgress.repositoryName || repositoryName,
              timestamp: progressData.timestamp || new Date().toISOString()
            };

            newMap.set(parsingId, updatedProgress);
            return newMap;
          });

          // Remove from progress tracking when completed or failed
          if (progressData.completed || 
              progressData.status === 'completed' || 
              progressData.status === 'failed' || 
              progressData.status === 'cancelled') {
            
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
      showToast({
        title: 'Progress Tracking Failed',
        description: 'Unable to track parsing progress in real-time.',
        type: 'warning'
      });
    }
  };

  // Handle repository deletion
  const handleDeleteRepository = async (repository: RepositoryInfo) => {
    if (!window.confirm(`Are you sure you want to delete repository "${repository.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await knowledgeGraphService.deleteRepository(repository.id);
      
      if (response.success) {
        showToast({
          title: 'Repository Deleted',
          description: `Repository "${repository.name}" has been deleted successfully.`,
          type: 'success'
        });
        
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
      showToast({
        title: 'Delete Failed',
        description: errorMessage,
        type: 'error'
      });
    }
  };

  // Handle parsing cancellation
  const handleCancelParsing = async (parsingId: string) => {
    try {
      const response = await knowledgeGraphService.cancelParsing(parsingId);
      
      if (response.success) {
        showToast({
          title: 'Parsing Cancelled',
          description: 'Repository parsing has been cancelled successfully.',
          type: 'success'
        });
        
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
      showToast({
        title: 'Cancel Failed',
        description: errorMessage,
        type: 'error'
      });
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
    <div className="p-6 max-w-7xl mx-auto space-y-6" ref={containerRef}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Knowledge Graph
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Visualize and analyze code repositories with interactive knowledge graphs
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowParseModal(true)}
              icon={<Plus className="w-4 h-4" />}
              accentColor="purple"
              neonLine
            >
              Parse Repository
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <KnowledgeGraphStats
        totalRepositories={totalRepositories}
        totalLanguages={totalLanguages}
        totalFiles={totalFiles}
        activeParsing={activeParsing}
      />

      {/* Active Parsing Progress */}
      <AnimatePresence>
        {parsingProgress.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              Active Parsing Operations
            </h2>
            <div className="grid gap-4">
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

      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <Card accentColor="cyan" variant="bordered" className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search repositories, languages, or URLs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="min-w-[150px]"
                options={[
                  { value: '', label: 'All Languages' },
                  ...supportedLanguages.map(language => ({
                    value: language,
                    label: language.charAt(0).toUpperCase() + language.slice(1)
                  }))
                ]}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'list' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                icon={<List className="w-4 h-4" />}
                accentColor="purple"
              >
                List
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                icon={<Grid className="w-4 h-4" />}
                accentColor="purple"
              >
                Grid
              </Button>
              <Button
                variant={viewMode === 'graph' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('graph')}
                icon={<Network className="w-4 h-4" />}
                accentColor="purple"
              >
                Graph
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Repository Content */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="p-6 animate-pulse">
                <div className="space-y-4">
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-16"></div>
                    <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-16"></div>
                  </div>
                </div>
              </Card>
            ))}
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card accentColor="pink" className="p-8 text-center">
              <div className="text-red-500 mb-4">
                <Brain className="w-12 h-12 mx-auto" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Failed to Load Repositories</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
              <Button onClick={loadRepositories} accentColor="pink">
                Try Again
              </Button>
            </Card>
          </motion.div>
        ) : viewMode === 'graph' && selectedRepository && selectedRepository.all_languages ? (
          <motion.div
            key="graph-view"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
          >
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              <div className="xl:col-span-3">
                <KnowledgeGraphVisualization
                  repository={selectedRepository}
                  onNodeSelect={(node) => console.log('Selected node:', node)}
                />
              </div>
              <div className="xl:col-span-1">
                <RepositoryAnalysisPanel
                  repository={selectedRepository}
                  onClose={() => setSelectedRepository(null)}
                />
              </div>
            </div>
          </motion.div>
        ) : filteredRepositories.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="p-12 text-center">
              <div className="text-gray-400 mb-4">
                <Brain className="w-16 h-16 mx-auto" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Repositories Found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {searchTerm || languageFilter 
                  ? "No repositories match your current filters."
                  : "Get started by parsing your first repository to build a knowledge graph."
                }
              </p>
              <div className="flex justify-center gap-3">
                {(searchTerm || languageFilter) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm('');
                      setLanguageFilter('');
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
                <Button
                  onClick={() => setShowParseModal(true)}
                  icon={<Plus className="w-4 h-4" />}
                  accentColor="purple"
                >
                  Parse Repository
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="repositories"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className={viewMode === 'list' 
              ? "space-y-4" 
              : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            }>
              {filteredRepositories.map((repository, index) => (
                <RepositoryCard
                  key={repository.id}
                  repository={repository}
                  viewMode={viewMode}
                  onSelect={() => setSelectedRepository(repository)}
                  onDelete={() => handleDeleteRepository(repository)}
                  onViewGraph={() => {
                    setSelectedRepository(repository);
                    setViewMode('graph');
                  }}
                  style={{
                    animationDelay: `${index * 100}ms`
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pagination */}
      {totalPages > 1 && !loading && !error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex justify-center items-center gap-4 mt-8"
        >
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
          
          <Button
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </motion.div>
      )}

      {/* Modals */}
      <ParseRepositoryModal
        isOpen={showParseModal}
        onClose={() => setShowParseModal(false)}
        onParse={handleParseRepository}
        supportedLanguages={supportedLanguages}
      />
    </div>
  );
};