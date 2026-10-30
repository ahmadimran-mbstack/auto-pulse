import * as React from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
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
  },
  awaiting_approval: {
    variant: "warning",
    label: "Awaiting approval",
  },
  approved: {
    variant: "success",
    label: "Approved",
    icon: <CheckIcon className="size-3 text-status-success-fg" />,
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
  },
  failed: {
    variant: "danger",
    label: "Failed",
  },
  expired: {
    variant: "warning",
    label: "Expired",
  },
  pending: {
    variant: "warning",
    label: "Pending",
  },
};

interface StatusBadgeProps {
  status: PostStatus | string;
  className?: string;
}

// StatusBadge maps post statuses to consistent semantic badge colors, labels, and icons
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const config = statusMap[normalized] || {
    variant: "neutral",
    label: status.replace(/_/g, " "),
  };

  return (
    <Badge variant={config.variant} className={className}>
      {config.icon}
      <span>{config.label}</span>
    </Badge>
  );
}
