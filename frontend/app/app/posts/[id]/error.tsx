"use client";

import * as React from "react";
import Link from "next/link";
import { ErrorState } from "@/components/app/ErrorState";
import { Button } from "@/components/ui/button";

export default function PostDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-12 space-y-4 max-w-lg">
      <ErrorState
        message={error.message || "We could not load this post right now."}
        onRetry={reset}
      />
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href="/app/posts">Back to posts</Link>
        </Button>
      </div>
    </div>
  );
}
