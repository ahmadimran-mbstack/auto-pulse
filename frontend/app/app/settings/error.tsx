"use client";

import * as React from "react";
import { ErrorState } from "@/components/app/ErrorState";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-12">
      <ErrorState
        message={error.message || "We could not load your settings right now."}
        onRetry={reset}
      />
    </div>
  );
}
