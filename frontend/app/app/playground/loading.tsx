import { Skeleton } from "@/components/ui/skeleton";

// Instant loading skeleton shown while Playground route streams in
export default function PlaygroundLoading() {
  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-[360px] w-full rounded-xl" />
    </div>
  );
}

