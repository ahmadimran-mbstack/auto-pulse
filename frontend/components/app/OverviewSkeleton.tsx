import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholder matching the final Overview dashboard layout
export function OverviewSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Page Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Four metric cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today section skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-md shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-3/4 max-w-md" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-9 w-32 shrink-0 hidden sm:block" />
          </div>
        </Card>
      </div>

      {/* Recent posts section skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Card>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4">
                <div className="space-y-1.5 flex-1 max-w-lg">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
