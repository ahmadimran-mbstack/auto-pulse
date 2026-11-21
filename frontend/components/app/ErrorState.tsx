"use client";

import * as React from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorDetails {
  status?: number;
  requestUrl?: string;
  code?: string;
  message?: string;
}

function extractErrorDetails(error: unknown): ErrorDetails | null {
  if (!error || typeof error !== "object") return null;
  const err = error as Record<string, unknown>;
  const status = typeof err.status === "number" ? err.status : undefined;
  const requestUrl = typeof err.requestUrl === "string" ? err.requestUrl : undefined;
  const code = typeof err.code === "string" ? err.code : undefined;
  const message = typeof err.message === "string" ? err.message : undefined;
  if (status === undefined && !requestUrl && !code) return null;
  return { status, requestUrl, code, message };
}

interface ErrorStateProps {
  title?: string;
  message: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

// ErrorState displays a straightforward error message, Retry action, and expandable Details
export function ErrorState({
  title,
  message,
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const [showDetails, setShowDetails] = React.useState(false);
  const details = extractErrorDetails(error);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center",
        className
      )}
    >
      {title && (
        <>
          <div className="flex size-10 items-center justify-center rounded-full bg-status-danger-bg text-status-danger-fg mb-4">
            <AlertCircle className="size-4 stroke-[1.75]" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-1">{title}</h2>
        </>
      )}
      <p
        className={cn(
          "text-sm mb-4 max-w-sm",
          title ? "text-muted-foreground" : "text-destructive font-medium"
        )}
      >
        {message}
      </p>

      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant={title ? "default" : "outline"} size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        {details && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
            className="gap-1 text-muted-foreground"
          >
            <span>Details</span>
            {showDetails ? (
              <ChevronUp className="size-4 stroke-[1.75]" />
            ) : (
              <ChevronDown className="size-4 stroke-[1.75]" />
            )}
          </Button>
        )}
      </div>

      {showDetails && details && (
        <div className="mt-4 w-full max-w-md rounded-md border border-border bg-muted/30 px-3.5 py-2.5 text-left text-xs text-muted-foreground space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span>Status</span>
            <span className="font-mono tabular-nums text-foreground">
              {details.status === 0
                ? "Network error"
                : details.status ?? "Unknown"}
            </span>
          </div>
          {details.requestUrl && (
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0">Request</span>
              <span className="font-mono text-foreground break-all text-right">
                {details.requestUrl}
              </span>
            </div>
          )}
          {details.code && (
            <div className="flex items-center justify-between gap-2">
              <span>Code</span>
              <span className="font-mono text-foreground">{details.code}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
