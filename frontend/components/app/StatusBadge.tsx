import * as React from "react";
import { CheckIcon, Loader2Icon, ClockIcon, AlertCircleIcon } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { PostStatus } from "@/types/posts";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface StatusConfig {
  variant: BadgeVariant;
  label: string;
  icon?: React.ReactNode;
}

const statusMap: Record<string, StatusConfig> = {
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

  return (
    <Badge variant={config.variant} className={className}>
      {config.icon}
      <span>{config.label}</span>
    </Badge>
  );
}
