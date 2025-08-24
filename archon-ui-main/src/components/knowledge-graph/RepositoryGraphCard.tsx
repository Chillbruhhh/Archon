import { useState } from 'react';
import { 
  Trash2, 
  RefreshCw, 
  Code, 
  FileText, 
  GitBranch, 
  Pencil,
  BoxIcon
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Checkbox } from '../ui/Checkbox';
import { RepositoryInfo } from '../../services/knowledgeGraphService';
import { useCardTilt } from '../../hooks/useCardTilt';
import '../../styles/card-animations.css';


// Delete confirmation modal component
interface DeleteConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
}

const DeleteConfirmModal = ({
  onConfirm,
  onCancel,
  title,
  message,
}: DeleteConfirmModalProps) => {
  return (
    <div className="fixed inset-0 bg-gray-500/50 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-full max-w-md">
        <Card className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-zinc-400 mb-6">{message}</p>
          <div className="flex justify-end gap-4">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-pink-500 text-white rounded-md hover:bg-pink-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

interface RepositoryGraphCardProps {
  repository: RepositoryInfo;
  onDelete: (repositoryId: string) => void;
  onRefresh?: (repositoryId: string) => void;
  onSelect?: (repository: RepositoryInfo) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (event: React.MouseEvent) => void;
  index?: number;
}

export const RepositoryGraphCard = ({
  repository,
  onDelete,
  onRefresh,
  onSelect,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
  index = 0
}: RepositoryGraphCardProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNodeTooltip, setShowNodeTooltip] = useState(false);
  const [showFileTooltip, setShowFileTooltip] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Always use teal/cyan theme for knowledge graph cards
  const accentColor = 'cyan';
  
  // Use the tilt effect hook - disable in selection mode
  const { cardRef, tiltStyles, handlers } = useCardTilt({
    max: isSelectionMode ? 0 : 10,
    scale: isSelectionMode ? 1 : 1.02,
    perspective: 1200,
  });

  const handleDelete = () => {
    setIsRemoving(true);
    // Delay the actual deletion to allow for the animation
    setTimeout(() => {
      onDelete(repository.id);
      setShowDeleteConfirm(false);
    }, 500);
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh(repository.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };


  // Calculate nodes count (you might need to get this from repository statistics)
  const nodeCount = repository.total_nodes || 0;
  const edgeCount = repository.total_relationships || 0;

  return (
    <div
      ref={cardRef}
      className={`card-3d relative h-full ${isRemoving ? 'card-removing' : ''}`}
      style={{
        transform: tiltStyles.transform,
        transition: tiltStyles.transition,
        animationDelay: `${index * 100}ms`
      }}
      {...handlers}
    >
      <Card
        accentColor={accentColor}
        className={`relative h-full flex flex-col overflow-hidden ${
          isSelected ? 'ring-2 ring-cyan-500 dark:ring-cyan-400' : ''
        } ${isSelectionMode ? 'cursor-pointer' : ''}`}
        onClick={(e) => {
          if (isSelectionMode && onToggleSelection) {
            e.stopPropagation();
            onToggleSelection(e);
          } else if (onSelect) {
            onSelect(repository);
          }
        }}
      >
        {/* Checkbox for selection mode */}
        {isSelectionMode && (
          <div className="absolute top-3 right-3 z-20">
            <Checkbox
              checked={isSelected}
              onChange={() => {}}
              className="pointer-events-none"
            />
          </div>
        )}
        
        {/* Reflection overlay */}
        <div
          className="card-reflection"
          style={{
            opacity: tiltStyles.reflectionOpacity,
            backgroundPosition: tiltStyles.reflectionPosition,
          }}
        />
        
        {/* Glow effect - teal/cyan theme */}
        <div
          className={`card-glow card-glow-${accentColor}`}
          style={{
            opacity: tiltStyles.glowIntensity * 0.3,
            background: `radial-gradient(circle at ${tiltStyles.glowPosition.x}% ${tiltStyles.glowPosition.y}%, 
              rgba(34, 211, 238, 0.6) 0%, 
              rgba(34, 211, 238, 0) 70%)`,
          }}
        />
        
        {/* Content container with proper z-index and flex layout */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Header section - fixed height */}
          <div className="flex items-center gap-2 mb-3 card-3d-layer-1">
            {/* Repository type icons - matching Knowledge Base pattern */}
            <GitBranch className="w-4 h-4 text-cyan-500" />
            <BoxIcon className="w-4 h-4 text-cyan-500" />
            <h3 className="text-gray-800 dark:text-white font-medium flex-1 line-clamp-1 truncate min-w-0">
              {repository.name}
            </h3>
            {!isSelectionMode && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Add edit functionality
                  }}
                  className="p-1 text-gray-500 hover:text-cyan-500"
                  title="Edit"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="p-1 text-gray-500 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          
          {/* Description section - fixed height */}
          <p className="text-gray-600 dark:text-zinc-400 text-sm mb-3 line-clamp-2 card-3d-layer-2">
            {repository.repository_url || repository.local_path || 'Local repository'}
          </p>
          
          {/* Primary language section - flexible height with flex-1 */}
          <div className="flex-1 flex flex-col card-3d-layer-2 min-h-[4rem]">
            <div className="w-full">
              <div className="flex flex-wrap gap-2 h-full">
                <Badge
                  color="cyan"
                  variant="outline"
                  className="text-xs"
                >
                  {repository.primary_language || 'Unknown'}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Footer section - anchored to bottom */}
          <div className="flex items-end justify-between mt-auto card-3d-layer-1">
            {/* Left side - refresh button and updated */}
            <div className="flex flex-col">
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 mb-1 px-2 py-1 text-cyan-500 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300 transition-colors"
                title="Refresh repository parsing"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="text-sm font-medium">Reparse</span>
              </button>
              <span className="text-xs text-gray-500 dark:text-zinc-500">
                Parsed: {formatDate(repository.created_at)}
              </span>
            </div>
            
            {/* Right side - statistics and actions */}
            <div className="flex items-center gap-2">
              {/* Graph nodes count - cyan neon container */}
              {nodeCount > 0 && (
                <div
                  className="cursor-pointer relative card-3d-layer-3"
                  onClick={() => onSelect && onSelect(repository)}
                  onMouseEnter={() => setShowNodeTooltip(true)}
                  onMouseLeave={() => setShowNodeTooltip(false)}
                >
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-sm transition-all duration-300 bg-cyan-500/20 border border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_20px_rgba(34,211,238,0.5)]">
                    <Code className="w-3 h-3 text-cyan-400" />
                    <span className="text-xs text-cyan-400 font-medium">
                      {nodeCount.toLocaleString()}
                    </span>
                  </div>
                  {/* Graph nodes tooltip - positioned relative to the badge */}
                  {showNodeTooltip && (
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black dark:bg-zinc-800 text-white text-xs rounded-lg py-2 px-3 shadow-lg z-50 max-w-xs">
                      <div className="font-semibold text-cyan-300 mb-2">
                        Click for Graph View
                      </div>
                      <div className="max-h-32 overflow-y-auto">
                        <div className="mb-1 text-cyan-200">
                          • {nodeCount.toLocaleString()} code entities
                        </div>
                        <div className="text-cyan-200">
                          • {(repository.total_relationships || 0).toLocaleString()} relationships
                        </div>
                      </div>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black dark:border-t-zinc-800"></div>
                    </div>
                  )}
                </div>
              )}
              
              {/* File count - orange neon container */}
              <div
                className="relative card-3d-layer-3"
                onMouseEnter={() => setShowFileTooltip(true)}
                onMouseLeave={() => setShowFileTooltip(false)}
              >
                <div className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 border border-orange-500/40 rounded-full backdrop-blur-sm shadow-[0_0_15px_rgba(251,146,60,0.3)] transition-all duration-300">
                  <FileText className="w-3 h-3 text-orange-400" />
                  <span className="text-xs text-orange-400 font-medium">
                    {(repository.total_files || 0).toLocaleString()}
                  </span>
                </div>
                {/* File count tooltip - positioned relative to the badge */}
                {showFileTooltip && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-black dark:bg-zinc-800 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-50 whitespace-nowrap">
                    <div className="font-medium mb-1">
                      {(repository.parsed_files || 0).toLocaleString()} / {(repository.total_files || 0).toLocaleString()} files parsed
                    </div>
                    <div className="text-gray-300 space-y-0.5">
                      {repository.parsing_duration_seconds && (
                        <div>
                          Parsed in {repository.parsing_duration_seconds < 60 
                            ? `${repository.parsing_duration_seconds}s`
                            : `${Math.floor(repository.parsing_duration_seconds / 60)}m ${repository.parsing_duration_seconds % 60}s`}
                        </div>
                      )}
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black dark:border-t-zinc-800"></div>
                  </div>
                )}
              </div>
              
              <Badge
                color="green"
                className="card-3d-layer-2"
              >
                Active
              </Badge>
            </div>
          </div>
        </div>
      </Card>
      
      {showDeleteConfirm && (
        <DeleteConfirmModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          title="Delete Repository"
          message={`Are you sure you want to delete repository "${repository.name}"? This action cannot be undone.`}
        />
      )}
    </div>
  );
};