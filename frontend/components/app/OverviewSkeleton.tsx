import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholder matching the exact reference Overview layout
export function OverviewSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 w-full max-w-full min-w-0 overflow-x-hidden animate-pulse">
      {/* 1. Tools row skeleton */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 h-auto sm:h-9 w-full min-w-0">
        <Skeleton className="flex-1 min-w-[140px] h-9 rounded-lg" />
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="size-9 rounded-lg shrink-0" />
          <Skeleton className="h-9 w-16 rounded-lg shrink-0" />
          <Skeleton className="h-9 w-36 rounded-full shrink-0" />
        </div>
      </div>

      {/* 2. Responsive Grid: stacked on mobile, 5fr 7fr on desktop */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 w-full min-w-0 max-w-full">
        {/* Left column */}
        <div className="space-y-6 min-w-0 w-full">
          {/* Last 30 days card skeleton */}
          <div className="space-y-4 min-w-0 w-full">
            <Skeleton className="h-5 w-32" />
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 w-full min-w-0">
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
          <div className="space-y-4 min-w-0 w-full">
            <Skeleton className="h-5 w-20" />
            <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center justify-center space-y-3 w-full min-w-0">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>

          {/* Today card skeleton */}
          <div className="space-y-4 min-w-0 w-full">
            <Skeleton className="h-5 w-20" />
            <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4 w-full min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="size-14 rounded-md shrink-0" />
                <div className="space-y-2 min-w-0">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-md shrink-0" />
            </div>
          </div>
        </div>

        {/* Right column: Posts skeleton */}
        <div className="space-y-4 min-w-0 w-full">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-4 w-full min-w-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3 w-full min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="size-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 min-w-0">
                      <Skeleton className="h-4 w-48 max-w-full" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="size-8 rounded-full shrink-0" />
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
