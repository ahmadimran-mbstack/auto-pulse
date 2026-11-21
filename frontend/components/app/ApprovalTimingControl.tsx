"use client";

import * as React from "react";
import { Mail, MessageSquare, PenLine, Share2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  APPROVAL_LEAD_OPTIONS,
  computeNextPreviewTimeline,
  formatPlainScheduleTime,
} from "@/lib/schedule-timeline";

export interface ApprovalTimingControlProps {
  value: number;
  onChange: (minutes: number) => void;
  timezone: string;
  postTime: string;
  postDays: number[];
  useSlack: boolean;
  helperText?: string;
  footerNote?: string;
  compact?: boolean;
}

export function ApprovalTimingControl({
  value,
  onChange,
  timezone,
  postTime,
  postDays,
  useSlack,
  helperText = "We write the draft and send you an approval request before it publishes. You can approve any time before then.",
  footerNote,
  compact = false,
}: ApprovalTimingControlProps) {
  const previewTimeline = React.useMemo(
    () =>
      computeNextPreviewTimeline({
        timezone: timezone || "UTC",
        postTime: postTime || "09:00",
        postDays,
        approvalLeadMinutes: value || 180,
      }),
    [timezone, postTime, postDays, value]
  );

  return (
    <div className="space-y-2 pt-1 text-left">
      <Label>Send approval request</Label>
      <p className="text-caption text-muted-foreground">{helperText}</p>
      <div
        role="group"
        aria-label="Send approval request lead time"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1"
      >
        {APPROVAL_LEAD_OPTIONS.map((opt) => {
          const active = value === opt.minutes;
          return (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => onChange(opt.minutes)}
              aria-pressed={active}
              className={`px-3 py-2 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-secondary/40"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {previewTimeline && (
        <div
          className={`mt-3 rounded-lg border border-card-border bg-muted/20 ${
            compact ? "p-3 space-y-2.5" : "p-4 space-y-3"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">
              Next post preview
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {timezone || "UTC"} ({previewTimeline.tzOffset})
            </span>
          </div>

          {previewTimeline.tooClose && (
            <p className="text-xs text-status-warning-fg bg-status-warning-bg border border-status-warning-border rounded-md px-3 py-2">
              Your approval request will be sent right after the draft is written, about{" "}
              {previewTimeline.minutesBeforePublish} minutes before publishing.
            </p>
          )}

          <div className="relative pl-5 space-y-2.5 border-l-2 border-border ml-2">
            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3">
              <span className="absolute -left-[30px] top-0.5 bg-card p-0.5 rounded-full text-muted-foreground">
                <PenLine className="size-4 stroke-[1.75]" />
              </span>
              <span className="text-xs text-foreground">Draft is written</span>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {formatPlainScheduleTime(previewTimeline.draftAt, timezone || "UTC")}
              </span>
            </div>
            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3">
              <span className="absolute -left-[30px] top-0.5 bg-card p-0.5 rounded-full text-status-info-fg">
                {useSlack ? (
                  <MessageSquare className="size-4 stroke-[1.75]" />
                ) : (
                  <Mail className="size-4 stroke-[1.75]" />
                )}
              </span>
              <span className="text-xs text-foreground">
                {useSlack
                  ? "Approval request sent to Slack"
                  : "Approval request sent by email"}
              </span>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {formatPlainScheduleTime(previewTimeline.approvalAt, timezone || "UTC")}
              </span>
            </div>
            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-3">
              <span className="absolute -left-[30px] top-0.5 bg-card p-0.5 rounded-full text-status-success-fg">
                <Share2 className="size-4 stroke-[1.75]" />
              </span>
              <span className="text-xs text-foreground">Publishes to LinkedIn</span>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {formatPlainScheduleTime(previewTimeline.publishAt, timezone || "UTC")}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              You can approve any time before it publishes. If not approved in time, it is skipped.
            </p>
            {footerNote && (
              <p className="text-xs text-muted-foreground">{footerNote}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
