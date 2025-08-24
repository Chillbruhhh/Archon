import React from 'react';
import { Card } from '../ui/Card';

export const RepositoryGraphSkeleton: React.FC = () => {
  return (
    <Card accentColor="cyan" className="relative overflow-hidden h-full">
      {/* Shimmer effect overlay - cyan themed */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent" />
      
      {/* Header icons skeleton */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 bg-cyan-200 dark:bg-cyan-800 rounded animate-pulse" />
        <div className="w-4 h-4 bg-cyan-200 dark:bg-cyan-800 rounded animate-pulse" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 dark:bg-zinc-800 rounded w-3/4 animate-pulse" />
        </div>
        <div className="flex gap-1">
          <div className="w-3 h-3 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="w-3 h-3 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
      </div>
      
      {/* Description skeleton */}
      <div className="mb-3">
        <div className="h-4 bg-gray-200 dark:bg-zinc-800 rounded w-5/6 animate-pulse" />
      </div>
      
      {/* Primary language badge skeleton */}
      <div className="flex-1 flex flex-col min-h-[4rem] mb-4">
        <div className="w-16 h-6 bg-cyan-200 dark:bg-cyan-800 rounded-full animate-pulse" />
      </div>
      
      {/* Footer section skeleton */}
      <div className="flex items-end justify-between mt-auto">
        {/* Left side - refresh button and date */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1 mb-1">
            <div className="w-3 h-3 bg-cyan-200 dark:bg-cyan-800 rounded animate-pulse" />
            <div className="w-12 h-4 bg-cyan-200 dark:bg-cyan-800 rounded animate-pulse" />
          </div>
          <div className="w-20 h-3 bg-gray-200 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
        
        {/* Right side - statistics badges */}
        <div className="flex items-center gap-2">
          {/* Graph nodes count badge */}
          <div className="flex items-center gap-1 px-2 py-1 bg-cyan-200/30 dark:bg-cyan-800/30 rounded-full">
            <div className="w-3 h-3 bg-cyan-200 dark:bg-cyan-800 rounded animate-pulse" />
            <div className="w-6 h-3 bg-cyan-200 dark:bg-cyan-800 rounded animate-pulse" />
          </div>
          
          {/* File count badge */}
          <div className="flex items-center gap-1 px-2 py-1 bg-orange-200/30 dark:bg-orange-800/30 rounded-full">
            <div className="w-3 h-3 bg-orange-200 dark:bg-orange-800 rounded animate-pulse" />
            <div className="w-6 h-3 bg-orange-200 dark:bg-orange-800 rounded animate-pulse" />
          </div>
          
          {/* Status badge */}
          <div className="w-12 h-6 bg-green-200 dark:bg-green-800 rounded animate-pulse" />
        </div>
      </div>
    </Card>
  );
};

export const RepositoryGraphGridSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, index) => (
        <RepositoryGraphSkeleton key={index} />
      ))}
    </div>
  );
};