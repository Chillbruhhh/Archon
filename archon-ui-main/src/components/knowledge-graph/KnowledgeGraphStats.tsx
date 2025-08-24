import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Code, Globe, Zap } from 'lucide-react';
import { Card } from '../ui/Card';

interface KnowledgeGraphStatsProps {
  totalRepositories: number;
  totalLanguages: number;
  totalFiles: number;
  activeParsing: number;
}

export const KnowledgeGraphStats: React.FC<KnowledgeGraphStatsProps> = ({
  totalRepositories,
  totalLanguages,
  totalFiles,
  activeParsing
}) => {
  const stats = [
    {
      label: 'Repositories',
      value: totalRepositories,
      icon: Brain,
      accentColor: 'purple' as const,
      description: 'Parsed repositories'
    },
    {
      label: 'Languages',
      value: totalLanguages,
      icon: Code,
      accentColor: 'blue' as const,
      description: 'Supported languages'
    },
    {
      label: 'Total Files',
      value: totalFiles.toLocaleString(),
      icon: Globe,
      accentColor: 'green' as const,
      description: 'Files analyzed'
    },
    {
      label: 'Active Parsing',
      value: activeParsing,
      icon: Zap,
      accentColor: activeParsing > 0 ? 'orange' as const : 'cyan' as const,
      description: 'Operations running'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            duration: 0.4, 
            delay: 0.3 + index * 0.1,
            type: "spring",
            stiffness: 100
          }}
        >
          <Card 
            accentColor={stat.accentColor} 
            variant="bordered" 
            className="p-6 hover:scale-105 transition-transform duration-300"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {stat.description}
                </p>
              </div>
              <div className={`
                p-3 rounded-lg 
                ${stat.accentColor === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : ''}
                ${stat.accentColor === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''}
                ${stat.accentColor === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : ''}
                ${stat.accentColor === 'orange' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : ''}
                ${stat.accentColor === 'cyan' ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400' : ''}
              `}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            
            {/* Animated progress indicator for active parsing */}
            {stat.label === 'Active Parsing' && activeParsing > 0 && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <motion.div
                    className="bg-gradient-to-r from-orange-400 to-orange-600 h-1 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatType: "reverse",
                      ease: "easeInOut"
                    }}
                  />
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
};