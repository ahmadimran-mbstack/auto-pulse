"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PostThumbnail } from "@/components/app/PostThumbnail";
import { StatusBadge } from "@/components/app/StatusBadge";
import { StatusRing } from "@/components/app/status-ring";
import { Button } from "@/components/ui/button";
import { formatNextDraftTime } from "@/lib/posts";
import { generateDraftNow } from "@/lib/api";
import type { DashboardTodayPost, DashboardSchedule } from "@/types/dashboard";

interface TodayCardProps {
  today?: DashboardTodayPost | null;
  schedule?: DashboardSchedule;
  timezone?: string | null;
}

export function TodayCard({ today, schedule, timezone }: TodayCardProps) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const formattedNextDraft = formatNextDraftTime(schedule?.next_draft_at, timezone);

  const handleGenerateNow = async () => {
    setIsGenerating(true);
    try {
      await generateDraftNow(true);
      toast.success("Draft generated successfully! Dispatched to Slack & Email for your approval.");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate draft. Please verify your profile settings.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div data-slot="card" className="rounded-lg border border-card-border bg-card p-4">
      {!today ? (
        // Empty state with automated schedule details and instant draft generation trigger
        <div className="py-6 px-4 flex flex-col items-center justify-center text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-primary mb-3">
            <Sparkles className="size-5" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-1">
            Automated Publishing Active
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4">
            {schedule?.next_draft_at
              ? `Next draft due ${formattedNextDraft}${timezone ? ` (${timezone})` : ""}. AutoPulse will draft your post and send an approval DM to your Slack.`
              : `Your posts will be created automatically based on your schedule.`}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateNow}
            disabled={isGenerating}
            className="h-8 gap-1.5 text-xs font-medium bg-background hover:bg-accent shadow-xs"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Generating draft with agents...</span>
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 text-primary" />
                <span>Generate today&apos;s draft now</span>
              </>
            )}
          </Button>
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
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3 shrink-0" />
                <span>
                  {today.publish_at
                    ? `Scheduled for ${new Date(today.publish_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${timezone ? ` (${timezone})` : ""}`
                    : `Run date ${today.run_date}`}
                </span>
              </p>
            </div>
          </div>

          {/* Right action area: StatusBadge, StatusRing and Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            <StatusBadge status={today.status} />
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
