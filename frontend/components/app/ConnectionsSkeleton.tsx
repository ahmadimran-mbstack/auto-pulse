import * as React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholder matching the Connections layout
export function ConnectionsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Page Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* LinkedIn Section skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-52" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-9 w-32" />
        </Card>
      </div>

      {/* Other Networks Section skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Card className="p-6 divide-y divide-border">
          <div className="py-3 flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="py-3 flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-28" />
          </div>
        </Card>
      </div>
    </div>
  );
}
