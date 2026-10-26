"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  total?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
}

// 16px circular progress ring with 2px stroke and round caps
export function ProgressRing({
  value,
  total = 100,
  size = 16,
  strokeWidth = 2,
  color = "var(--status-info-arc)",
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;
  const strokeDashoffset = circumference * (1 - fraction);

  return (
    <div
      style={{ width: size, height: size }}
      className={cn("relative flex shrink-0 items-center justify-center", className)}
      aria-hidden="true"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
