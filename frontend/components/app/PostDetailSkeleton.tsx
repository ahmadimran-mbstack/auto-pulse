import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

// Loading placeholder matching the Post Detail two-column layout
export function PostDetailSkeleton() {
  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-12" />
        <span className="text-muted-foreground">/</span>
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Page Header skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>

      {/* Alert banner skeleton */}
      <Skeleton className="h-16 w-full rounded-lg" />

      {/* Two columns: Post preview left, sources right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-4 space-y-4">
            <Skeleton className="aspect-square w-full rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </Card>
        </div>
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4 space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Card>
        </div>
      </div>
    </div>
  );
}
