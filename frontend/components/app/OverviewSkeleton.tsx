import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholder matching the exact 3fr:4fr reference Overview layout
export function OverviewSkeleton() {
  return (
    <div className="p-6 md:p-8 space-y-8 animate-pulse">
      {/* 1. Tools row skeleton */}
      <div className="flex items-center gap-2 h-9 w-full">
        <Skeleton className="flex-1 h-9 rounded-lg" />
        <Skeleton className="size-9 rounded-lg shrink-0" />
        <Skeleton className="h-9 w-16 rounded-lg shrink-0" />
        <Skeleton className="h-9 w-40 rounded-full shrink-0" />
      </div>

      {/* 2. Two-column grid skeleton: 3fr 4fr */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_4fr] gap-6">
        {/* Left column */}
        <div className="space-y-8">
          {/* Last 30 days card skeleton */}
          <div className="space-y-5">
            <Skeleton className="h-5 w-32" />
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          </div>

          {/* Alerts card skeleton */}
          <div className="space-y-5">
            <Skeleton className="h-5 w-20" />
            <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center justify-center space-y-3">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>

          {/* Today card skeleton */}
          <div className="space-y-5">
            <Skeleton className="h-5 w-20" />
            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="size-14 rounded-md" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        </div>

        {/* Right column: Posts skeleton */}
        <div className="space-y-5">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="size-8 rounded-full" />
                </div>
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
