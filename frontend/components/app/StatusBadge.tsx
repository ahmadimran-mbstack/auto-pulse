import * as React from "react";
import {
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Clock,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PostStatus } from "@/types/posts";

export type StatusVariant =
  | "warning"
  | "success"
  | "danger"
  | "info"
  | "neutral"
  | "processing";

export interface StatusConfig {
  variant: StatusVariant;
  label: string;
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  success: "bg-status-success-bg text-status-success-fg border-status-success-border",
  warning: "bg-status-warning-bg text-status-warning-fg border-status-warning-border",
  danger: "bg-status-danger-bg text-status-danger-fg border-status-danger-border",
  info: "bg-status-info-bg text-status-info-fg border-status-info-border",
  neutral: "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
  processing: "bg-status-info-bg text-status-info-fg border-status-info-border",
};

const ICON_CLS = "size-4 shrink-0 stroke-[1.75]";

export const statusMap: Record<string, StatusConfig> = {
  // Post statuses
  draft: {
    variant: "warning",
    label: "Draft",
    icon: <Clock className={ICON_CLS} aria-hidden="true" />,
  },
  awaiting_approval: {
    variant: "warning",
    label: "Awaiting approval",
    icon: <Clock className={ICON_CLS} aria-hidden="true" />,
  },
  approved: {
    variant: "success",
    label: "Approved",
    icon: <CircleCheck className={ICON_CLS} aria-hidden="true" />,
  },
  scheduled: {
    variant: "info",
    label: "Scheduled",
    icon: <Clock className={ICON_CLS} aria-hidden="true" />,
  },
  publishing: {
    variant: "processing",
    label: "Publishing",
    icon: <LoaderCircle className={cn(ICON_CLS, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />,
  },
  published: {
    variant: "success",
    label: "Published",
    icon: <CircleCheck className={ICON_CLS} aria-hidden="true" />,
  },
  rejected: {
    variant: "danger",
    label: "Rejected",
    icon: <CircleX className={ICON_CLS} aria-hidden="true" />,
  },
  failed: {
    variant: "danger",
    label: "Failed",
    icon: <CircleX className={ICON_CLS} aria-hidden="true" />,
  },
  outcome_unknown: {
    variant: "warning",
    label: "Outcome unknown",
    icon: <TriangleAlert className={ICON_CLS} aria-hidden="true" />,
  },
  expired: {
    variant: "warning",
    label: "Expired",
    icon: <Clock className={ICON_CLS} aria-hidden="true" />,
  },
  pending: {
    variant: "warning",
    label: "Pending",
    icon: <Clock className={ICON_CLS} aria-hidden="true" />,
  },

  // Document statuses
  uploaded: {
    variant: "neutral",
    label: "Queued",
    icon: <Clock className={ICON_CLS} aria-hidden="true" />,
  },
  extracting: {
    variant: "processing",
    label: "Reading file",
    icon: <LoaderCircle className={cn(ICON_CLS, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />,
  },
  distilling: {
    variant: "processing",
    label: "Learning from it",
    icon: <LoaderCircle className={cn(ICON_CLS, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />,
  },
  embedding: {
    variant: "processing",
    label: "Applying",
    icon: <LoaderCircle className={cn(ICON_CLS, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />,
  },
  ready: {
    variant: "success",
    label: "Active",
    icon: <CircleCheck className={ICON_CLS} aria-hidden="true" />,
  },
  disabled: {
    variant: "neutral",
    label: "Paused",
    icon: <CirclePause className={ICON_CLS} aria-hidden="true" />,
  },
  needs_attention: {
    variant: "warning",
    label: "Needs attention",
    icon: <TriangleAlert className={ICON_CLS} aria-hidden="true" />,
  },

  // Version statuses
  up_to_date: {
    variant: "success",
    label: "Up to date",
    icon: <CircleCheck className={ICON_CLS} aria-hidden="true" />,
  },
  rebuilding: {
    variant: "processing",
    label: "Rebuilding",
    icon: <LoaderCircle className={cn(ICON_CLS, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />,
  },

  // Instructions save state
  saved: {
    variant: "success",
    label: "Saved",
    icon: <CircleCheck className={ICON_CLS} aria-hidden="true" />,
  },
  saving: {
    variant: "processing",
    label: "Saving",
    icon: <LoaderCircle className={cn(ICON_CLS, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />,
  },
  unsaved: {
    variant: "warning",
    label: "Unsaved changes",
    icon: <TriangleAlert className={ICON_CLS} aria-hidden="true" />,
  },

  // Playground statuses
  connected: {
    variant: "success",
    label: "Connected",
    icon: <CircleCheck className={ICON_CLS} aria-hidden="true" />,
  },
  disconnected: {
    variant: "neutral",
    label: "Not connected",
    icon: <CircleDashed className={ICON_CLS} aria-hidden="true" />,
  },
  ready_to_post: {
    variant: "success",
    label: "Ready to post",
    icon: <CircleCheck className={ICON_CLS} aria-hidden="true" />,
  },
  review_suggested: {
    variant: "warning",
    label: "Review suggested",
    icon: <TriangleAlert className={ICON_CLS} aria-hidden="true" />,
  },
  run_failed: {
    variant: "danger",
    label: "Failed",
    icon: <CircleX className={ICON_CLS} aria-hidden="true" />,
  },
  running: {
    variant: "processing",
    label: "Running",
    icon: <LoaderCircle className={cn(ICON_CLS, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />,
  },
};

export interface StatusBannerStyle {
  alertVariant: "warning" | "success" | "danger" | "info";
  bgClass: string;
  borderClass: string;
  textClass: string;
  descClass: string;
  iconClass: string;
}

export const statusBannerStyles: Record<"warning" | "success" | "danger" | "info", StatusBannerStyle> = {
  warning: {
    alertVariant: "warning",
    bgClass: "bg-status-warning-bg",
    borderClass: "border-status-warning-border",
    textClass: "text-status-warning-fg",
    descClass: "text-status-warning-fg/90",
    iconClass: "text-status-warning-fg",
  },
  success: {
    alertVariant: "success",
    bgClass: "bg-status-success-bg",
    borderClass: "border-status-success-border",
    textClass: "text-status-success-fg",
    descClass: "text-status-success-fg/90",
    iconClass: "text-status-success-fg",
  },
  danger: {
    alertVariant: "danger",
    bgClass: "bg-status-danger-bg",
    borderClass: "border-status-danger-border",
    textClass: "text-status-danger-fg",
    descClass: "text-status-danger-fg/90",
    iconClass: "text-status-danger-fg",
  },
  info: {
    alertVariant: "info",
    bgClass: "bg-status-info-bg",
    borderClass: "border-status-info-border",
    textClass: "text-status-info-fg",
    descClass: "text-status-info-fg/90",
    iconClass: "text-status-info-fg",
  },
};

export function getStatusBannerStyle(status: string): StatusBannerStyle {
  const normalized = (status || "").toLowerCase();
  const config = statusMap[normalized];
  const v = config?.variant;
  if (v === "warning" || v === "success" || v === "danger" || v === "info") {
    return statusBannerStyles[v];
  }
  return statusBannerStyles.info;
}

interface StatusBadgeProps {
  status: PostStatus | string;
  label?: string;
  variant?: StatusVariant;
  className?: string;
}

export function StatusBadge({ status, label, variant, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const mapped = statusMap[normalized];
  const resolvedVariant: StatusVariant = variant ?? mapped?.variant ?? "neutral";
  const resolvedLabel = label ?? mapped?.label ?? status.replace(/_/g, " ");
  const icon = mapped?.icon ?? <CircleDashed className={ICON_CLS} aria-hidden="true" />;

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors duration-150",
        VARIANT_CLASSES[resolvedVariant],
        className
      )}
    >
      {icon}
      <span>{resolvedLabel}</span>
    </span>
  );

  if (normalized === "outcome_unknown") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          LinkedIn may have posted this. Check your profile.
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
