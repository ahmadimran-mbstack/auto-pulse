import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  message: string;
  action?: React.ReactNode;
  className?: string;
}

// EmptyState displays a single sentence and a single action with zero decorative illustrations
export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
