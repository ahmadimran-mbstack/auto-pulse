import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AnalyticsSkeletonProps {
  showHeader?: boolean;
}

export function AnalyticsSkeleton({ showHeader = true }: AnalyticsSkeletonProps = {}) {
  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full min-w-0">
      {showHeader && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pb-6 border-b border-border">
          <div className="space-y-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-9 w-48 rounded-lg" />
        </div>
      )}

      {/* LinkedIn scope notice skeleton */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 min-h-14 flex items-center gap-3">
        <Skeleton className="size-4 rounded-full shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3.5 w-64 max-w-full" />
          <Skeleton className="h-3 w-96 max-w-full" />
        </div>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card key={idx} className="p-5 min-h-32 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
            <div className="space-y-2 pt-3">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          </Card>
        ))}
      </div>

      {/* Posts over time chart card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full rounded-md" />
        </CardContent>
      </Card>

      {/* Funnel + Approval Turnaround row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Card key={idx} className="min-h-80">
            <CardHeader className="pb-4">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-48 w-full rounded-md" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-full rounded-md" />
                <Skeleton className="h-8 w-full rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Hook style + Topic breakdown row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Card key={idx} className="min-h-96">
            <CardHeader className="pb-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-48 w-full rounded-md" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((__, rowIdx) => (
                  <Skeleton key={rowIdx} className="h-8 w-full rounded-md" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent posts table card */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </CardHeader>
        <div className="divide-y divide-border border-t border-border">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="flex items-center justify-between px-6 py-3.5 gap-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

