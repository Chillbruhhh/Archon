import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  GitBranch, 
  FileText,
  RotateCcw,
  X,
  Search,
  Download,
  Cpu,
  Database,
  Code,
  Zap,
  Square,
  FolderTree,
  Network,
  TrendingUp,
  XCircle
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { KGParsingProgressData } from '../../services/knowledgeGraphProgressService';
import { useTerminalScroll } from '../../hooks/useTerminalScroll';

interface ParsingProgressCardProps {
  progress: KGParsingProgressData;
  onCancel: () => void;
  onComplete?: (data: KGParsingProgressData) => void;
  onError?: (error: string) => void;
  onProgress?: (data: KGParsingProgressData) => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

interface ProgressStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  percentage: number;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

export const ParsingProgressCard: React.FC<ParsingProgressCardProps> = ({
  progress,
  onCancel,
  onRetry,
  onDismiss
}) => {
  const [showDetailedProgress, setShowDetailedProgress] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Use the terminal scroll hook for auto-scrolling logs (if logs are available)
  const logsContainerRef = useTerminalScroll(progress.errors || [], showLogs);

  // Handle stop parsing action
  const handleStopParsing = async () => {
    console.log('🛑 Stop button clicked for KG parsing!');
    console.log('🛑 Progress data:', progress);
    console.log('🛑 Parsing ID:', progress.parsingId);
    console.log('🛑 Is stopping:', isStopping);
    
    if (!progress.parsingId || isStopping) {
      console.log('🛑 Stopping early - no parsing ID or already stopping');
      return;
    }
    
    try {
      setIsStopping(true);
      console.log('🛑 Stopping KG parsing with ID:', progress.parsingId);
      
      // Optimistic UI update - immediately show stopping status
      progress.status = 'cancelled';
      
      // Call the onCancel callback
      if (onCancel) {
        console.log('🛑 Calling onCancel callback');
        onCancel();
      }
    } catch (error) {
      console.error('Failed to stop KG parsing:', error);
      // Revert optimistic update on error
      progress.status = progress.status === 'cancelled' ? 'parsing' : progress.status;
    } finally {
      setIsStopping(false);
    }
  };

  // Calculate individual progress steps based on current status and percentage
  const getProgressSteps = (): ProgressStep[] => {
    // 8-step Knowledge Graph parsing process
    const steps: ProgressStep[] = [
      {
        id: 'repository_setup',
        label: 'Repository Setup',
        icon: <GitBranch className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      },
      {
        id: 'code_cloning',
        label: 'Code Cloning',
        icon: <Download className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      },
      {
        id: 'file_discovery',
        label: 'File Discovery',
        icon: <FolderTree className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      },
      {
        id: 'ast_parsing',
        label: 'AST Parsing',
        icon: <Code className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      },
      {
        id: 'node_extraction',
        label: 'Node Extraction',
        icon: <Cpu className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      },
      {
        id: 'relationship_analysis',
        label: 'Relationship Analysis',
        icon: <Network className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      },
      {
        id: 'graph_construction',
        label: 'Graph Construction',
        icon: <Database className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      },
      {
        id: 'finalization',
        label: 'Finalization',
        icon: <Zap className="w-4 h-4" />,
        percentage: 0,
        status: 'pending'
      }
    ];

    // Map current status to normalized step IDs
    const currentStatus = progress.status;
    const currentPercentage = progress.percentage || 0;

    // Map backend status to frontend step IDs
    const statusMapping: Record<string, string> = {
      'starting': 'repository_setup',
      'cloning': 'code_cloning', 
      'parsing': 'ast_parsing',
      'analyzing': 'relationship_analysis'
    };

    const normalizedStatus = statusMapping[currentStatus] || currentStatus;

    // Define step order for completion tracking
    const stepOrder = ['repository_setup', 'code_cloning', 'file_discovery', 'ast_parsing', 'node_extraction', 'relationship_analysis', 'graph_construction', 'finalization'];
    
    // Update step progress based on current status
    steps.forEach((step) => {
      const stepIndex = stepOrder.indexOf(step.id);
      const currentStepIndex = stepOrder.indexOf(normalizedStatus);
      
      if (currentStatus === 'failed' || currentStatus === 'cancelled') {
        if (stepIndex <= currentStepIndex) {
          step.status = stepIndex === currentStepIndex ? 'error' : 'completed';
          step.percentage = stepIndex === currentStepIndex ? currentPercentage : 100;
        } else {
          step.status = 'pending';
          step.percentage = 0;
        }
      } else if (currentStatus === 'completed') {
        step.status = 'completed';
        step.percentage = 100;
      } else if (step.id === normalizedStatus) {
        // This is the active step
        step.status = 'active';
        
        // Calculate phase-specific percentage based on overall progress
        const phaseRanges = {
          'repository_setup': { start: 0, end: 12.5 },
          'code_cloning': { start: 12.5, end: 25 },
          'file_discovery': { start: 25, end: 40 },
          'ast_parsing': { start: 40, end: 60 },
          'node_extraction': { start: 60, end: 80 },
          'relationship_analysis': { start: 80, end: 90 },
          'graph_construction': { start: 90, end: 100 },
          'finalization': { start: 100, end: 100 }
        };
        
        const range = phaseRanges[step.id as keyof typeof phaseRanges];
        if (range && currentPercentage >= range.start) {
          // Calculate percentage within this phase
          const phaseProgress = ((currentPercentage - range.start) / (range.end - range.start)) * 100;
          step.percentage = Math.min(Math.round(phaseProgress), 100);
        } else {
          step.percentage = currentPercentage;
        }
      } else if (stepIndex < currentStepIndex) {
        // Previous steps are completed
        step.status = 'completed';
        step.percentage = 100;
      } else {
        // Future steps are pending
        step.status = 'pending';
        step.percentage = 0;
      }

      // Set specific messages based on current status
      if (step.status === 'active') {
        // Use backend message if available
        if (progress.message) {
          step.message = progress.message;
        } else {
          // Fallback messages based on step
          switch (step.id) {
            case 'repository_setup':
              step.message = 'Initializing repository...';
              break;
            case 'code_cloning':
              step.message = `Cloning ${progress.repositoryName || 'repository'}...`;
              break;
            case 'file_discovery':
              step.message = `Found ${progress.totalFiles || 0} files`;
              break;
            case 'ast_parsing':
              step.message = `${progress.processedFiles || 0} of ${progress.totalFiles || 0} files`;
              break;
            case 'node_extraction':
              step.message = `${progress.nodesCreated || 0} nodes created`;
              break;
            case 'relationship_analysis':
              step.message = `${progress.relationshipsCreated || 0} relationships found`;
              break;
            case 'graph_construction':
              step.message = 'Building knowledge graph...';
              break;
            case 'finalization':
              step.message = 'Completing analysis...';
              break;
          }
        }
      }
    });

    return steps;
  };

  // Helper functions matching CrawlingProgressCard pattern
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'starting':
        return <Clock className="w-4 h-4 text-cyan-500 animate-pulse" />;
      case 'cloning':
        return <GitBranch className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'parsing':
        return <Code className="w-4 h-4 text-orange-500 animate-pulse" />;
      case 'analyzing':
        return <Network className="w-4 h-4 text-purple-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (): 'purple' | 'green' | 'pink' | 'blue' | 'cyan' | 'orange' | 'none' => {
    if (!progress?.status) {
      return 'none';
    }
    
    switch (progress.status) {
      case 'starting':
        return 'cyan';
      case 'cloning':
        return 'blue';
      case 'parsing':
        return 'orange';
      case 'analyzing':
        return 'purple';
      case 'completed':
        return 'green';
      case 'failed':
        return 'pink';
      case 'cancelled':
        return 'orange'; // Using orange instead of yellow as Card doesn't support yellow
      default:
        return 'none'; // Using none instead of gray as Card doesn't support gray
    }
  };

  const getBadgeColor = () => {
    switch (progress.status) {
      case 'starting':
        return 'blue'; // Badge doesn't support cyan, use blue
      case 'cloning':
        return 'blue';
      case 'parsing':
        return 'orange';
      case 'analyzing':
        return 'purple';
      case 'completed':
        return 'green';
      case 'failed':
        return 'pink';
      case 'cancelled':
        return 'orange'; // Using orange instead of yellow
      default:
        return 'gray';
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'starting':
        return 'Initializing repository...';
      case 'cloning':
        return 'Cloning repository...';
      case 'parsing':
        return 'Parsing code files...';
      case 'analyzing':
        return 'Analyzing relationships...';
      case 'completed':
        return 'Knowledge graph completed';
      case 'failed':
        return 'Parsing failed';
      case 'cancelled':
        return 'Cancelled by user';
      default:
        return 'Processing...';
    }
  };

  const isActive = ['starting', 'cloning', 'parsing', 'analyzing'].includes(progress.status);
  const isCompleted = progress.status === 'completed';
  const hasError = progress.status === 'failed';
  const isCancelled = progress.status === 'cancelled';

  const steps = getProgressSteps();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
      className="w-full"
    >
      <Card
        accentColor={getStatusColor() || 'none'}
        variant="bordered"
        className="p-4 overflow-hidden"
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {progress.repositoryName || 'Knowledge Graph'}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {getStatusText()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge color={getBadgeColor() as any} className="text-xs">
                {progress.status}
              </Badge>

              {isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStopParsing}
                  disabled={isStopping}
                  className={`
                    border-2 text-xs px-3 py-1 font-medium transition-all duration-300
                    ${isStopping 
                      ? 'border-gray-400 text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed'
                      : 'border-red-500 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 hover:border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.3)] hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                    }
                  `}
                >
                  <Square className="w-3 h-3 mr-1" />
                  {isStopping ? 'Stopping...' : 'Stop'}
                </Button>
              )}
            </div>
          </div>

          {/* Step-by-step progress */}
          {(isActive || isCompleted || hasError) && (
            <div className="space-y-3">
              {/* Overall progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Overall Progress
                  </span>
                  <span className="font-medium">
                    {progress.percentage || 0}%
                  </span>
                </div>
                
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full transition-all duration-500 ${
                      getStatusColor() === 'cyan' ? 'bg-gradient-to-r from-cyan-400 to-cyan-600' :
                      getStatusColor() === 'blue' ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                      getStatusColor() === 'orange' ? 'bg-gradient-to-r from-orange-400 to-orange-600' :
                      getStatusColor() === 'purple' ? 'bg-gradient-to-r from-purple-400 to-purple-600' :
                      getStatusColor() === 'green' ? 'bg-gradient-to-r from-green-400 to-green-600' :
                      getStatusColor() === 'pink' ? 'bg-gradient-to-r from-pink-400 to-pink-600' :
                      'bg-gradient-to-r from-gray-400 to-gray-600'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percentage || 0}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Step progress toggle */}
              <button
                onClick={() => setShowDetailedProgress(!showDetailedProgress)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <Database className="w-3 h-3" />
                Detailed Progress
                <motion.div
                  animate={{ rotate: showDetailedProgress ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-3 h-3" />
                </motion.div>
              </button>

              {/* Detailed step-by-step progress */}
              <AnimatePresence>
                {showDetailedProgress && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-2"
                  >
                    {steps.map((step, index) => (
                      <div
                        key={step.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                      >
                        <div className={`
                          flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium
                          ${step.status === 'completed' ? 'bg-green-500 text-white' :
                            step.status === 'active' ? 'bg-cyan-500 text-white animate-pulse' :
                            step.status === 'error' ? 'bg-red-500 text-white' :
                            'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}
                        `}>
                          {step.status === 'completed' ? '✓' :
                           step.status === 'error' ? '✗' :
                           index + 1}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-medium ${
                              step.status === 'active' ? 'text-cyan-600 dark:text-cyan-400' :
                              step.status === 'completed' ? 'text-green-600 dark:text-green-400' :
                              step.status === 'error' ? 'text-red-600 dark:text-red-400' :
                              'text-gray-600 dark:text-gray-400'
                            }`}>
                              {step.label}
                            </span>
                            
                            {step.status === 'active' && (
                              <span className="text-xs text-gray-500">
                                {step.percentage}%
                              </span>
                            )}
                          </div>

                          {step.message && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {step.message}
                            </p>
                          )}

                          {step.status === 'active' && (
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-2">
                              <motion.div
                                className="h-full bg-cyan-500 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${step.percentage}%` }}
                                transition={{ duration: 0.5 }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="text-gray-400 dark:text-gray-500">
                          {step.icon}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Statistics */}
          {(progress.nodesCreated || progress.relationshipsCreated) && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {progress.nodesCreated && (
                <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <div className="font-medium text-blue-600 dark:text-blue-400">
                    {progress.nodesCreated.toLocaleString()}
                  </div>
                  <div className="text-xs text-blue-500 dark:text-blue-400">
                    Code Entities
                  </div>
                </div>
              )}
              {progress.relationshipsCreated && (
                <div className="text-center p-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                  <div className="font-medium text-purple-600 dark:text-purple-400">
                    {progress.relationshipsCreated.toLocaleString()}
                  </div>
                  <div className="text-xs text-purple-500 dark:text-purple-400">
                    Relationships
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current file being processed */}
          {progress.currentFile && isActive && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <FileText className="w-3 h-3" />
              <span className="truncate">Processing: {progress.currentFile}</span>
            </div>
          )}

          {/* Errors */}
          {progress.errors && progress.errors.length > 0 && (
            <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="font-medium mb-2">Recent Errors:</div>
              <div className="max-h-20 overflow-y-auto space-y-1">
                {progress.errors.slice(-3).map((error, index) => (
                  <div key={index} className="text-xs opacity-80">• {error}</div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons for completed/failed states */}
          {(isCompleted || hasError || isCancelled) && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {isCompleted && 'Knowledge graph ready to explore'}
                {hasError && 'Parsing encountered errors'}
                {isCancelled && 'Parsing was cancelled'}
              </div>
              
              <div className="flex gap-2">
                {hasError && onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="text-orange-600 border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
                
                {onDismiss && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                    className="text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Animated background for active states */}
        {isActive && (
          <motion.div
            className="absolute inset-0 opacity-5"
            animate={{
              background: [
                `linear-gradient(45deg, transparent 30%, ${
                  getStatusColor() === 'cyan' ? 'rgba(34, 211, 238, 0.5)' :
                  getStatusColor() === 'blue' ? 'rgba(59, 130, 246, 0.5)' :
                  getStatusColor() === 'orange' ? 'rgba(245, 158, 11, 0.5)' :
                  getStatusColor() === 'purple' ? 'rgba(139, 92, 246, 0.5)' :
                  'rgba(107, 114, 128, 0.5)'
                } 70%, transparent 100%)`,
                `linear-gradient(45deg, transparent 70%, ${
                  getStatusColor() === 'cyan' ? 'rgba(34, 211, 238, 0.5)' :
                  getStatusColor() === 'blue' ? 'rgba(59, 130, 246, 0.5)' :
                  getStatusColor() === 'orange' ? 'rgba(245, 158, 11, 0.5)' :
                  getStatusColor() === 'purple' ? 'rgba(139, 92, 246, 0.5)' :
                  'rgba(107, 114, 128, 0.5)'
                } 100%, transparent 130%)`
              ]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        )}
      </Card>
    </motion.div>
  );
};