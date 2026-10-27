"use client";

import { Badge } from "@/components/ui/badge";
import { PlatformLabel } from "@/components/app/PlatformLabel";
import { StatusBadge } from "@/components/app/StatusBadge";
import type { PostStatus, PostApprovalItem } from "@/types/posts";

interface PostDecisionBadgeProps {
  post: {
    status: PostStatus;
    approval?: PostApprovalItem | null;
  };
  className?: string;
  showTime?: boolean;
  layout?: "vertical" | "horizontal";
}

import { formatDecisionTime } from "@/lib/posts";
export { formatDecisionTime };

/**
 * PostDecisionBadge:
 * Displays decision provenance (Slack / Email) with timestamps for decided posts.
 * Falls back to the standard StatusBadge for pending or undecided posts.
 */
export function PostDecisionBadge({
  post,
  className,
  showTime = true,
  layout = "vertical",
}: PostDecisionBadgeProps) {
  const approval = post.approval;
  const decision =
    approval?.decision ??
    (post.status === "approved"
      ? "approved"
      : post.status === "rejected"
      ? "rejected"
      : null);

  // If no decision recorded or post is still pending/awaiting approval/draft, use standard StatusBadge
  if (!decision || post.status === "awaiting_approval" || post.status === "draft") {
    return <StatusBadge status={post.status} className={className} />;
  }

  // Determine channel (defaults to email if unspecified upon decision)
  const channel = approval?.channel ?? "email";
  const isSlack = channel === "slack";
  const isApproved = decision === "approved";
  const formattedTime = approval?.decided_at ? formatDecisionTime(approval.decided_at) : "";

  const label = isApproved
    ? isSlack
      ? "Approved via Slack"
      : "Approved via Email"
    : isSlack
    ? "Rejected via Slack"
    : "Rejected via Email";

  const badgeVariant = isApproved ? "approved" : "danger";

  const icon = isSlack ? (
    <PlatformLabel platform="slack" showName={false} size="xs" />
  ) : (
    <PlatformLabel platform="email" showName={false} size="xs" />
  );

  const badgeElement = (
    <Badge variant={badgeVariant} className={className}>
      {icon}
      <span>{label}</span>
    </Badge>
  );

  if (!showTime || !formattedTime) {
    return badgeElement;
  }

  if (layout === "horizontal") {
    return (
      <div className="inline-flex items-center gap-2">
        {badgeElement}
        <span className="text-caption text-muted-foreground tabular-nums">
          {formattedTime}
        </span>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      {badgeElement}
      <span className="text-caption text-muted-foreground tabular-nums">
        {formattedTime}
      </span>
    </div>
  );
}
