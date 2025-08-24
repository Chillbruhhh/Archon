import React from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar, 
  FileText, 
  GitBranch, 
  Globe, 
  MoreVertical, 
  Network,
  Trash2,
  BarChart3,
  Eye
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { RepositoryInfo } from '../../services/knowledgeGraphService';

interface RepositoryCardProps {
  repository: RepositoryInfo;
  viewMode: 'list' | 'grid' | 'graph';
  onSelect: () => void;
  onDelete: () => void;
  onViewGraph: () => void;
  style?: React.CSSProperties;
}

export const RepositoryCard: React.FC<RepositoryCardProps> = ({
  repository,
  viewMode,
  onSelect,
  onDelete,
  onViewGraph,
  style
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;
  };

  const getLanguageColor = (language: string) => {
    const colors: Record<string, string> = {
      python: 'bg-blue-500',
      javascript: 'bg-yellow-500',
      typescript: 'bg-blue-600',
      java: 'bg-orange-500',
      cpp: 'bg-purple-500',
      c: 'bg-gray-500',
      rust: 'bg-orange-600',
      go: 'bg-cyan-500',
      php: 'bg-purple-600',
      ruby: 'bg-red-500',
      swift: 'bg-orange-400',
      kotlin: 'bg-purple-400',
      csharp: 'bg-green-500',
    };
    return colors[language.toLowerCase()] || 'bg-gray-400';
  };

  const getPrimaryLanguageAccent = (language?: string): 'purple' | 'blue' | 'green' | 'orange' | 'cyan' | 'pink' => {
    if (!language) return 'purple';
    
    const accentMap: Record<string, 'purple' | 'blue' | 'green' | 'orange' | 'cyan' | 'pink'> = {
      python: 'blue',
      javascript: 'orange',
      typescript: 'blue',
      java: 'orange',
      cpp: 'purple',
      c: 'purple',
      rust: 'orange',
      go: 'cyan',
      php: 'purple',
      ruby: 'pink',
      swift: 'orange',
      kotlin: 'purple',
      csharp: 'green',
    };
    
    return accentMap[language.toLowerCase()] || 'purple';
  };

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        style={style}
      >
        <Card 
          accentColor={getPrimaryLanguageAccent(repository.primary_language)} 
          variant="bordered" 
          className="p-4 hover:scale-[1.02] transition-all duration-300 cursor-pointer"
          onClick={onSelect}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                    {repository.name}
                  </h3>
                  {repository.repository_url && (
                    <Globe className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <GitBranch className="w-4 h-4" />
                    {repository.branch_name}
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    {repository.parsed_files}/{repository.total_files} files
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(repository.created_at)}
                  </div>
                  {repository.parsing_duration_seconds && (
                    <div className="text-xs">
                      Parsed in {formatDuration(repository.parsing_duration_seconds)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {repository.all_languages.slice(0, 3).map((language) => (
                  <Badge
                    key={language}
                    className={`${getLanguageColor(language)} text-white text-xs px-2 py-1`}
                  >
                    {language}
                  </Badge>
                ))}
                {repository.all_languages.length > 3 && (
                  <Badge className="bg-gray-400 text-white text-xs px-2 py-1">
                    +{repository.all_languages.length - 3}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewGraph();
                }}
                icon={<Network className="w-4 h-4" />}
                accentColor="cyan"
              >
                Graph
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                icon={<Trash2 className="w-4 h-4" />}
                accentColor="pink"
              >
                Delete
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ 
        duration: 0.4,
        type: "spring",
        stiffness: 100
      }}
      style={style}
    >
      <Card 
        accentColor={getPrimaryLanguageAccent(repository.primary_language)} 
        variant="bordered"
        className="p-6 hover:scale-105 transition-all duration-300 cursor-pointer group"
        onClick={onSelect}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                  {repository.name}
                </h3>
                {repository.repository_url && (
                  <Globe className="w-4 h-4 text-gray-400" />
                )}
              </div>
              
              <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                <GitBranch className="w-4 h-4" />
                {repository.branch_name}
              </div>
            </div>

            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  // Add dropdown menu here
                }}
                icon={<MoreVertical className="w-4 h-4" />}
              />
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">
                {repository.parsed_files}/{repository.total_files} files
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">
                {formatDate(repository.created_at)}
              </span>
            </div>
          </div>

          {/* Languages */}
          <div>
            <div className="flex flex-wrap gap-1">
              {repository.all_languages.slice(0, 4).map((language) => (
                <Badge
                  key={language}
                  className={`${getLanguageColor(language)} text-white text-xs px-2 py-1`}
                >
                  {language}
                </Badge>
              ))}
              {repository.all_languages.length > 4 && (
                <Badge className="bg-gray-400 text-white text-xs px-2 py-1">
                  +{repository.all_languages.length - 4}
                </Badge>
              )}
            </div>
          </div>

          {/* Parsing Duration */}
          {repository.parsing_duration_seconds && (
            <div className="text-xs text-gray-500 dark:text-gray-500">
              Parsed in {formatDuration(repository.parsing_duration_seconds)}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onViewGraph();
              }}
              icon={<Network className="w-4 h-4" />}
              accentColor="cyan"
              className="flex-1"
            >
              View Graph
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              icon={<BarChart3 className="w-4 h-4" />}
              accentColor="purple"
              className="flex-1"
            >
              Analytics
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              icon={<Trash2 className="w-4 h-4" />}
              accentColor="pink"
            />
          </div>
        </div>
      </Card>
    </motion.div>
  );
};