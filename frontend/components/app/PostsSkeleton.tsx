import * as React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PostsSkeletonProps {
  showHeader?: boolean;
}

// Loading placeholder matching the Posts table layout
export function PostsSkeleton({ showHeader = true }: PostsSkeletonProps = {}) {
  const tableSkeleton = (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 gap-4">
            <Skeleton className="h-4 w-24" />
            <div className="flex-1 space-y-1.5 max-w-md">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    </Card>
  );

  if (!showHeader) {
    return <div className="space-y-4 animate-pulse">{tableSkeleton}</div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-16 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>

      {/* Table skeleton */}
      {tableSkeleton}
    </div>
  );
}
