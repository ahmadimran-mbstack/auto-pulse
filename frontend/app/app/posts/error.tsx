"use client";

import * as React from "react";
import { ErrorState } from "@/components/app/ErrorState";

export default function PostsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-12">
      <ErrorState
        message={error.message || "We could not load your posts list right now."}
        onRetry={reset}
      />
    </div>
  );
}
