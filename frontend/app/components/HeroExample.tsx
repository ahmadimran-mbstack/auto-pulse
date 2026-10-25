"use client";

import { useEffect, useState } from "react";
import { CheckIcon, RotateCcwIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Stage =
  | "finding"
  | "writing"
  | "designing"
  | "waiting"
  | "approved"
  | "published"
  | "rejected";

export function HeroExample() {
  const [stage, setStage] = useState<Stage>("finding");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncMotionPreference = () => {
      if (mediaQuery.matches) {
        setPrefersReducedMotion(true);
        setStage("waiting");
      }
    };

    const animId = requestAnimationFrame(syncMotionPreference);
    mediaQuery.addEventListener("change", syncMotionPreference);

    return () => {
      cancelAnimationFrame(animId);
      mediaQuery.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;

    if (stage === "finding") {
      const t1 = setTimeout(() => setStage("writing"), 1100);
      return () => clearTimeout(t1);
    }
    if (stage === "writing") {
      const t2 = setTimeout(() => setStage("designing"), 1100);
      return () => clearTimeout(t2);
    }
    if (stage === "designing") {
      const t3 = setTimeout(() => setStage("waiting"), 1100);
      return () => clearTimeout(t3);
    }
    if (stage === "approved") {
      const t4 = setTimeout(() => setStage("published"), 900);
      return () => clearTimeout(t4);
    }
  }, [stage, prefersReducedMotion]);

  const handleApprove = () => setStage("approved");
  const handleReject = () => setStage("rejected");
  const handleReplay = () => {
    if (prefersReducedMotion) {
      setStage("waiting");
    } else {
      setStage("finding");
    }
  };

  return (
    <div className="w-full max-w-lg bg-card rounded-lg border border-border p-6 text-left transition-all">
      {/* Header bar of example card */}
      <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          <span className="text-xs font-semibold text-muted-foreground">
            Daily Approval Queue
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReplay}
          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2 gap-1.5"
        >
          <RotateCcwIcon className="size-3.5" />
          <span>Replay sequence</span>
        </Button>
      </div>

      {/* Stepper progress indicator */}
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        <div
          className={`h-1.5 rounded-full transition-colors duration-120 ${
            stage === "finding" || stage === "writing" || stage === "designing" || stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-primary"
              : "bg-border"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors duration-120 ${
            stage === "writing" || stage === "designing" || stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-primary"
              : "bg-border"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors duration-120 ${
            stage === "designing" || stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-primary"
              : "bg-border"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors duration-120 ${
            stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-primary"
              : "bg-border"
          }`}
        />
      </div>

      {/* Dynamic status badge */}
      <div className="mb-4 flex items-center justify-between">
        {stage === "finding" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg animate-pulse" />
            1/4 Scanning industry trends...
          </Badge>
        )}
        {stage === "writing" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg animate-pulse" />
            2/4 Drafting executive perspective...
          </Badge>
        )}
        {stage === "designing" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg animate-pulse" />
            3/4 Designing branded visual card...
          </Badge>
        )}
        {stage === "waiting" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg" />
            Ready for your review
          </Badge>
        )}
        {stage === "approved" && (
          <Badge variant="approved" className="gap-1.5">
            <Loader2Icon className="size-3 animate-spin text-primary" />
            Approved · Publishing now...
          </Badge>
        )}
        {stage === "published" && (
          <Badge variant="published" className="gap-1.5">
            <CheckIcon className="size-3 text-primary" />
            Live on LinkedIn
          </Badge>
        )}
        {stage === "rejected" && (
          <Badge variant="danger" className="gap-1.5">
            Draft Rejected · Nothing published
          </Badge>
        )}

        <span className="text-caption text-muted-foreground">LinkedIn Post Preview</span>
      </div>

      {/* Realistic LinkedIn Post Container */}
      <div className="rounded-md border border-border bg-card p-4 mb-4">
        {/* Author header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="size-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
            AM
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-xs text-foreground truncate">Alex Morgan</span>
            </div>
            <p className="text-caption text-muted-foreground truncate">VP of Product & AI Architecture · 8:15 AM</p>
          </div>
        </div>

        {/* Post body */}
        <div className="text-xs text-foreground space-y-1.5 mb-3 leading-relaxed">
          <p className="font-medium text-foreground">
            Most teams measure activity metrics instead of completed customer workflows.
          </p>
          <p className="text-muted-foreground">
            When retention stalls, shipping more features rarely fixes the underlying friction. Measure completed workflows, not output volume.
          </p>
          <p className="text-primary font-medium pt-1">
            #ProductStrategy #EngineeringLeadership #AutoPulse
          </p>
        </div>

        {/* Branded visual card */}
        <div className="w-full h-32 rounded-md bg-primary p-3.5 flex flex-col justify-between text-primary-foreground relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold tracking-wider text-signal-line uppercase">
              AutoPulse Insight
            </span>
            <span className="text-caption font-mono opacity-80">08:00 AM</span>
          </div>
          <p className="text-xs font-semibold leading-snug text-primary-foreground max-w-sm">
            &ldquo;Measure completed customer workflows, not raw feature output volume.&rdquo;
          </p>
          <div className="flex items-center justify-between text-caption opacity-80">
            <span>autopulse.ai</span>
            <span>Verified draft</span>
          </div>
        </div>

        {/* Simulated Engagement Bar */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-border text-caption text-muted-foreground">
          <span>148 reactions</span>
          <span>32 comments · 14 reposts</span>
        </div>
      </div>

      {/* Interactive approval actions */}
      <div>
        {stage === "rejected" ? (
          <Button
            type="button"
            variant="default"
            onClick={handleReplay}
            className="w-full"
          >
            Generate next morning draft
          </Button>
        ) : stage === "published" ? (
          <div className="p-3 rounded-md bg-signal-soft border border-signal-line text-center">
            <p className="text-xs font-medium text-primary">
              Post successfully published to your LinkedIn profile.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="default"
              onClick={handleApprove}
              disabled={stage !== "waiting"}
              className="flex-1"
            >
              Approve & Publish
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReject}
              disabled={stage !== "waiting"}
              className="flex-1"
            >
              Reject Draft
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
