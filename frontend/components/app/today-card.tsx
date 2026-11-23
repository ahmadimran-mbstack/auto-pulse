"use client";

import * as React from "react";
import Link from "next/link";
import {
  PenLine,
  Loader2,
  Clock,
  Mail,
  MessageSquare,
  Share2,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PostThumbnail } from "@/components/app/PostThumbnail";
import { StatusBadge } from "@/components/app/StatusBadge";
import { StatusRing } from "@/components/app/status-ring";
import { Button } from "@/components/ui/button";
import { ApiClientError, generateDraftNow } from "@/lib/api";
import { useUser } from "@/components/providers/user-provider";
import { useEntitlements, invalidateEntitlements } from "@/lib/queries";
import { UpgradeDialog } from "@/components/app/UpgradeDialog";
import {
  formatCountdown,
  formatPlainScheduleTime,
} from "@/lib/schedule-timeline";
import type { DashboardTodayPost, DashboardSchedule } from "@/types/dashboard";

interface TodayCardProps {
  today?: DashboardTodayPost | null;
  schedule?: DashboardSchedule;
  timezone?: string | null;
}

function getNextPostStatusLabel(status: string): string | undefined {
  switch (status) {
    case "draft":
      return "Draft ready";
    case "awaiting_approval":
      return "Waiting for your approval";
    case "expired":
      return "Skipped (not approved)";
    default:
      return undefined;
  }
}

export function TodayCard({ today, schedule, timezone }: TodayCardProps) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { data: ent } = useEntitlements(user?.id);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [upgradeError, setUpgradeError] = React.useState<ApiClientError | null>(null);
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const tz = schedule?.timezone || timezone || "UTC";
  const tzOffset = schedule?.timezone_offset;
  const channel = today?.approval_channel || schedule?.approval_channel || "email";
  const countdown =
    today?.status === "awaiting_approval"
      ? formatCountdown(today.publish_at, nowMs)
      : null;

  const schedLimit = ent?.usage.scheduled_limit ?? null;
  const schedUsed = ent?.usage.scheduled_used ?? 0;
  const generateDisabledReason =
    ent?.status === "expired"
      ? "Plan expired. Upgrade to generate posts."
      : schedLimit !== null && schedUsed >= schedLimit
      ? `Monthly limit reached (${schedUsed}/${schedLimit}).`
      : null;

  const handleGenerateNow = async () => {
    setIsGenerating(true);
    try {
      await generateDraftNow(true);
      toast.success("Draft generated successfully! Dispatched for your approval.");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      invalidateEntitlements(user?.id);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 403) {
        setUpgradeError(err);
      } else {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to generate draft. Please verify your profile settings."
        );
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (!today && !schedule?.next_post_at) {
    return (
      <div
        data-slot="card"
        className="w-full min-w-0 overflow-hidden rounded-lg border border-card-border bg-card p-6 flex flex-col items-center justify-center text-center"
      >
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground mb-3">
          <CalendarClock className="size-5 stroke-[1.75]" />
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-1">
          No publishing schedule set
        </h4>
        <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4">
          Set your publish days, time, and approval lead time so AutoPulse can prepare and send posts for review.
        </p>
        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
          <Link href="/app/settings?tab=schedule">Set schedule</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      data-slot="card"
      className="w-full min-w-0 overflow-hidden rounded-lg border border-card-border bg-card p-4 space-y-4"
    >
      {!today ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-foreground">Next post</h4>
                <StatusBadge status="scheduled" label="Scheduled" />
              </div>
              <p className="text-xs text-muted-foreground">
                {tz}
                {tzOffset ? ` (${tzOffset})` : ""} · You can approve any time before it publishes.
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateNow}
                disabled={isGenerating || Boolean(generateDisabledReason)}
                className="h-8 gap-1.5 text-xs font-medium self-start sm:self-auto"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <PenLine className="size-3.5 text-primary stroke-[1.75]" />
                    <span>Generate draft now</span>
                  </>
                )}
              </Button>
              {generateDisabledReason && (
                <span className="text-[11px] text-muted-foreground">{generateDisabledReason}</span>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs">
              <PenLine className="size-4 shrink-0 stroke-[1.75] text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">Draft is written</p>
                <p className="font-medium text-foreground tabular-nums">
                  {formatPlainScheduleTime(schedule?.next_draft_at, tz)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {channel === "slack" ? (
                <MessageSquare className="size-4 shrink-0 stroke-[1.75] text-status-info-fg" />
              ) : (
                <Mail className="size-4 shrink-0 stroke-[1.75] text-status-info-fg" />
              )}
              <div>
                <p className="text-muted-foreground">
                  {channel === "slack" ? "Sent to Slack" : "Sent by email"}
                </p>
                <p className="font-medium text-foreground tabular-nums">
                  {formatPlainScheduleTime(schedule?.next_approval_at, tz)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Share2 className="size-4 shrink-0 stroke-[1.75] text-status-success-fg" />
              <div>
                <p className="text-muted-foreground">Publishes to LinkedIn</p>
                <p className="font-medium text-foreground tabular-nums">
                  {formatPlainScheduleTime(schedule?.next_post_at, tz)}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full min-w-0">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              {today.has_image !== false && (
                <div className="size-14 shrink-0 rounded-md overflow-hidden border border-border bg-muted">
                  <PostThumbnail
                    postId={today.id}
                    alt={today.topic_title}
                    width={240}
                    className="size-full object-cover"
                  />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <h4 className="text-sm font-semibold text-foreground truncate">
                  {today.topic_title}
                </h4>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5 shrink-0 stroke-[1.75]" />
                    <span>
                      Publishes {formatPlainScheduleTime(today.publish_at, tz)}
                    </span>
                  </span>
                  {countdown && (
                    <span className="font-medium text-status-warning-fg">
                      {countdown}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
              <StatusBadge
                status={today.status}
                label={getNextPostStatusLabel(today.status)}
              />
              <StatusRing status={today.status} size={32} />
              {today.status === "awaiting_approval" ? (
                <Button
                  asChild
                  size="sm"
                  className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium px-3"
                >
                  <Link href={`/app/posts/${today.id}`}>
                    {channel === "slack" ? "Review (or Slack)" : "Review"}
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-md text-xs font-medium px-3 hover:bg-accent"
                >
                  <Link href={`/app/posts/${today.id}`}>View</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 rounded-md border border-border bg-muted/20 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <PenLine className="size-3.5 shrink-0 stroke-[1.75] text-muted-foreground" />
              <span className="text-muted-foreground">Draft:</span>
              <span className="font-medium text-foreground tabular-nums">
                {today.status === "draft" ? "Ready" : "Written"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {channel === "slack" ? (
                <MessageSquare className="size-3.5 shrink-0 stroke-[1.75] text-status-info-fg" />
              ) : (
                <Mail className="size-3.5 shrink-0 stroke-[1.75] text-status-info-fg" />
              )}
              <span className="text-muted-foreground">Approval:</span>
              <span className="font-medium text-foreground tabular-nums">
                {today.approval_send_at
                  ? formatPlainScheduleTime(today.approval_send_at, tz)
                  : "Sent"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Share2 className="size-3.5 shrink-0 stroke-[1.75] text-status-success-fg" />
              <span className="text-muted-foreground">Publish:</span>
              <span className="font-medium text-foreground tabular-nums">
                {formatPlainScheduleTime(today.publish_at, tz)}
              </span>
            </div>
          </div>
        </div>
      )}
      <UpgradeDialog
        error={upgradeError}
        currentPlanId={ent?.plan_id}
        onClose={() => setUpgradeError(null)}
      />
    </div>
  );
}
