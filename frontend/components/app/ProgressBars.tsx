"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const STAGES = ["Uploaded", "Read", "Learned", "Applied"] as const;

interface StageProgressProps {
  /** 1-based current stage out of 4; pass null/undefined for indeterminate */
  stageIndex?: number | null;
  stageTotal?: number;
  className?: string;
}

export function StageProgress({
  stageIndex,
  stageTotal = 4,
  className,
}: StageProgressProps) {
  if (!stageIndex || stageIndex < 1) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 rounded-full bg-status-info-fg animate-pulse motion-reduce:animate-none" />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          Processing
        </span>
      </div>
    );
  }

  const clamped = Math.min(stageTotal, Math.max(1, stageIndex));

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="grid flex-1 grid-cols-4 gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={stageTotal}
        aria-valuenow={clamped}
        aria-label={`Step ${clamped} of ${stageTotal}`}
      >
        {STAGES.map((label, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < clamped;
          const isCurrent = stepNum === clamped;
          return (
            <div
              key={label}
              title={label}
              className={cn(
                "h-1.5 rounded-full transition-colors duration-150 motion-reduce:transition-none",
                isCompleted && "bg-status-info-fg",
                isCurrent && "bg-status-info-fg/75 animate-pulse motion-reduce:animate-none",
                !isCompleted && !isCurrent && "bg-muted"
              )}
            />
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        Step {clamped} of {stageTotal}
      </span>
    </div>
  );
}

interface LimitMeterProps {
  current: number;
  min?: number;
  max: number;
  className?: string;
}

export function LimitMeter({
  current,
  min = 0,
  max,
  className,
}: LimitMeterProps) {
  const safeMax = Math.max(1, max);
  const pct = Math.min(100, Math.round((current / safeMax) * 100));
  const inRange = current >= min && current <= safeMax;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {inRange
            ? "Within target length"
            : current < min
              ? `Minimum ${min} characters`
              : `Over ${safeMax} character limit`}
        </span>
        <span
          className={cn(
            "font-medium tabular-nums",
            inRange ? "text-status-success-fg" : "text-status-warning-fg"
          )}
        >
          {current} / {safeMax}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-150 motion-reduce:transition-none",
            inRange ? "bg-status-success-fg" : "bg-status-warning-fg"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
