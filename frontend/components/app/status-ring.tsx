"use client";

import * as React from "react";
import {
  Pencil,
  Clock,
  Check,
  CheckCheck,
  X,
  Minus,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostStatus } from "@/types/posts";

interface StatusRingProps {
  status: PostStatus | string;
  className?: string;
  size?: number;
}

// Circular 32px indicator with an SVG progress arc and centered status icon
export function StatusRing({
  status,
  className,
  size = 32,
}: StatusRingProps) {
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Map post status to arc percentage, color token and icon
  let arcFraction = 1.0;
  let arcColor = "var(--status-neutral-arc)";
  let label = "Status";
  let isSpinning = false;
  let IconComponent = Clock;

  switch (status) {
    case "draft":
      arcFraction = 0.25;
      arcColor = "var(--status-warning-arc)";
      label = "Draft";
      IconComponent = Pencil;
      break;
    case "awaiting_approval":
      arcFraction = 0.5;
      arcColor = "var(--status-warning-arc)";
      label = "Awaiting approval";
      IconComponent = Clock;
      break;
    case "approved":
      arcFraction = 1.0;
      arcColor = "var(--status-success-arc)";
      label = "Approved";
      IconComponent = Check;
      break;
    case "publishing":
      arcFraction = 0.75;
      arcColor = "var(--status-info-arc)";
      label = "Publishing";
      isSpinning = true;
      IconComponent = Loader2;
      break;
    case "published":
      arcFraction = 1.0;
      arcColor = "var(--status-success-arc)";
      label = "Published";
      IconComponent = CheckCheck;
      break;
    case "rejected":
      arcFraction = 1.0;
      arcColor = "var(--status-danger-arc)";
      label = "Rejected";
      IconComponent = X;
      break;
    case "expired":
      arcFraction = 1.0;
      arcColor = "var(--status-warning-arc)";
      label = "Expired";
      IconComponent = Minus;
      break;
    case "failed":
      arcFraction = 1.0;
      arcColor = "var(--status-danger-arc)";
      label = "Failed";
      IconComponent = AlertTriangle;
      break;
    default:
      arcFraction = 0.25;
      arcColor = "var(--status-warning-arc)";
      label = "Status";
      IconComponent = Clock;
      break;
  }

  const strokeDashoffset = circumference * (1 - arcFraction);

  return (
    <div
      role="status"
      aria-label={label}
      style={{ width: size, height: size }}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full bg-card",
        className
      )}
    >
      <svg
        width={size}
        height={size}
        className={cn(
          "absolute inset-0 -rotate-90",
          isSpinning && "animate-spin motion-reduce:animate-none"
        )}
      >
        {/* Background track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        {/* Colored progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <IconComponent
        className="size-4 shrink-0 text-foreground relative z-10"
        strokeWidth={1.5}
      />
    </div>
  );
}
