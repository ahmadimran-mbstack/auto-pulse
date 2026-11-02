import * as React from "react";
import { CheckIcon, Loader2Icon, ClockIcon, AlertCircleIcon, HelpCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PostStatus } from "@/types/posts";

export type StatusVariant = "warning" | "success" | "danger" | "info";

export interface StatusConfig {
  variant: StatusVariant;
  label: string;
  icon?: React.ReactNode;
}

export const statusMap: Record<string, StatusConfig> = {
  draft: {
    variant: "warning",
    label: "Draft",
    icon: <ClockIcon className="size-3 text-status-warning-fg" />,
  },
  awaiting_approval: {
    variant: "warning",
    label: "Awaiting approval",
    icon: <ClockIcon className="size-3 text-status-warning-fg" />,
  },
  approved: {
    variant: "success",
    label: "Approved",
    icon: <CheckIcon className="size-3 text-status-success-fg" />,
  },
  scheduled: {
    variant: "info",
    label: "Scheduled",
    icon: <ClockIcon className="size-3 text-status-info-fg" />,
  },
  publishing: {
    variant: "info",
    label: "Publishing",
    icon: <Loader2Icon className="size-3 animate-spin text-status-info-fg" />,
  },
  published: {
    variant: "success",
    label: "Published",
    icon: <CheckIcon className="size-3 text-status-success-fg" />,
  },
  rejected: {
    variant: "danger",
    label: "Rejected",
    icon: <AlertCircleIcon className="size-3 text-status-danger-fg" />,
  },
  failed: {
    variant: "danger",
    label: "Failed",
    icon: <AlertCircleIcon className="size-3 text-status-danger-fg" />,
  },
  outcome_unknown: {
    variant: "warning",
    label: "Outcome unknown",
    icon: <HelpCircleIcon className="size-3 text-status-warning-fg" />,
  },
  expired: {
    variant: "warning",
    label: "Expired",
    icon: <ClockIcon className="size-3 text-status-warning-fg" />,
  },
  pending: {
    variant: "warning",
    label: "Pending",
    icon: <ClockIcon className="size-3 text-status-warning-fg" />,
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

export const statusBannerStyles: Record<StatusVariant, StatusBannerStyle> = {
  warning: {
    alertVariant: "warning",
    bgClass: "bg-status-warning-bg",
    borderClass: "border-status-warning-arc/40",
    textClass: "text-status-warning-fg",
    descClass: "text-status-warning-fg/90",
    iconClass: "text-status-warning-fg",
  },
  success: {
    alertVariant: "success",
    bgClass: "bg-status-success-bg",
    borderClass: "border-status-success-arc/40",
    textClass: "text-status-success-fg",
    descClass: "text-status-success-fg/90",
    iconClass: "text-status-success-fg",
  },
  danger: {
    alertVariant: "danger",
    bgClass: "bg-status-danger-bg",
    borderClass: "border-status-danger-arc/40",
    textClass: "text-status-danger-fg",
    descClass: "text-status-danger-fg/90",
    iconClass: "text-status-danger-fg",
  },
  info: {
    alertVariant: "info",
    bgClass: "bg-status-info-bg",
    borderClass: "border-status-info-arc/40",
    textClass: "text-status-info-fg",
    descClass: "text-status-info-fg/90",
    iconClass: "text-status-info-fg",
  },
};

export function getStatusBannerStyle(status: string): StatusBannerStyle {
  const normalized = (status || "").toLowerCase();
  const config = statusMap[normalized];
  const variant = (config?.variant as StatusVariant) || "info";
  return statusBannerStyles[variant] || statusBannerStyles.info;
}

interface StatusBadgeProps {
  status: PostStatus | string;
  className?: string;
}

// StatusBadge maps post statuses to consistent semantic badge colors, labels, and icons (never grey)
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const config = statusMap[normalized] || {
    variant: "info",
    label: status.replace(/_/g, " "),
  };

  const badge = (
    <Badge variant={config.variant} className={className}>
      {config.icon}
      <span>{config.label}</span>
    </Badge>
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
