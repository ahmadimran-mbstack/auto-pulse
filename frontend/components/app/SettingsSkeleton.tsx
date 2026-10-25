import * as React from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholder matching the Settings layout with sub-navigation
export function SettingsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Page Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Settings layout: sub-nav left, content right */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Sub-nav skeleton */}
        <div className="w-full md:w-52 shrink-0 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>

        {/* Content form skeleton */}
        <div className="flex-1 w-full max-w-xl">
          <Card className="p-6 space-y-6">
            <div className="space-y-2 pb-4 border-b border-border">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-60" />
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-20 w-full rounded-md" />
              </div>
            </div>

            <Skeleton className="h-9 w-24 rounded-md" />
          </Card>
        </div>
      </div>
    </div>
  );
}
