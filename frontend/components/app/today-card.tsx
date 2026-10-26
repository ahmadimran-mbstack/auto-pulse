"use client";

import * as React from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { PostThumbnail } from "@/components/app/PostThumbnail";
import { StatusRing } from "@/components/app/status-ring";
import { Button } from "@/components/ui/button";
import { formatNextDraftTime } from "@/lib/posts";
import type { DashboardTodayPost, DashboardSchedule } from "@/types/dashboard";

interface TodayCardProps {
  today?: DashboardTodayPost | null;
  schedule?: DashboardSchedule;
  timezone?: string | null;
}

export function TodayCard({ today, schedule, timezone }: TodayCardProps) {
  const formattedNextDraft = formatNextDraftTime(schedule?.next_draft_at, timezone);

  return (
    <div data-slot="card" className="rounded-lg border border-card-border bg-card p-4">
      {!today ? (
        // Empty state: 32px bordered square with eye icon and next draft due date
        <div className="py-8 px-4 flex flex-col items-center justify-center text-center">
          <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground mb-3">
            <Eye className="size-4" />
          </div>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            Your next draft is due {formattedNextDraft || "soon"}.
          </p>
        </div>
      ) : (
        // Post for today row
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* 56px Thumbnail */}
            <div className="size-14 shrink-0 rounded-md overflow-hidden border border-border bg-muted">
              <PostThumbnail
                postId={today.id}
                alt={today.topic_title}
                width={240}
                className="size-full object-cover"
              />
            </div>

            {/* Title and publish timing */}
            <div className="min-w-0 space-y-0.5">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {today.topic_title}
              </h4>
              <p className="text-xs text-muted-foreground">
                {today.publish_at
                  ? `Scheduled for ${new Date(today.publish_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : `Run date ${today.run_date}`}
              </p>
            </div>
          </div>

          {/* Right action area: StatusRing and Button */}
          <div className="flex items-center gap-3 shrink-0">
            <StatusRing status={today.status} size={32} />
            {today.status === "awaiting_approval" ? (
              <Button
                asChild
                size="sm"
                className="h-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium px-3"
              >
                <Link href={`/app/posts/${today.id}`}>Review</Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 rounded-md text-sm font-medium px-3 hover:bg-accent"
              >
                <Link href={`/app/posts/${today.id}`}>View</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
