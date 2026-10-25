"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Sequence stages representing the daily post pipeline
type PipelineStage =
  | "finding"
  | "writing"
  | "designing"
  | "waiting"
  | "approved"
  | "published"
  | "rejected";

export function HeroExample() {
  const [stage, setStage] = useState<PipelineStage>("finding");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check if user prefers reduced motion to skip the automatic transitions
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleMotionChange = () => {
      if (mediaQuery.matches) {
        setPrefersReducedMotion(true);
        setStage("waiting");
      }
    };

    handleMotionChange();
    mediaQuery.addEventListener("change", handleMotionChange);

    return () => mediaQuery.removeEventListener("change", handleMotionChange);
  }, []);

  // Step through the automated sequence unless the user prefers reduced motion
  useEffect(() => {
    if (prefersReducedMotion) return;

    if (stage === "finding") {
      const timer = setTimeout(() => setStage("writing"), 1100);
      return () => clearTimeout(timer);
    }
    if (stage === "writing") {
      const timer = setTimeout(() => setStage("designing"), 1100);
      return () => clearTimeout(timer);
    }
    if (stage === "designing") {
      const timer = setTimeout(() => setStage("waiting"), 1100);
      return () => clearTimeout(timer);
    }
    if (stage === "approved") {
      const timer = setTimeout(() => setStage("published"), 900);
      return () => clearTimeout(timer);
    }
  }, [stage, prefersReducedMotion]);

  // User actions
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
    <Card className="w-full max-w-lg p-6 bg-card border-border text-left">
      {/* Example badge label and replay reset button */}
      <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          <Badge variant="neutral" className="text-caption font-mono uppercase">
            Example
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReplay}
          className="text-caption text-muted-foreground hover:text-foreground h-7 px-2 gap-1.5"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          <span>Replay example</span>
        </Button>
      </div>

      {/* Pipeline progress bar */}
      <div
        className="grid grid-cols-4 gap-1.5 mb-4"
        role="progressbar"
        aria-label="Daily draft preparation progress"
        aria-valuenow={
          stage === "finding"
            ? 25
            : stage === "writing"
            ? 50
            : stage === "designing"
            ? 75
            : 100
        }
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-1.5 rounded-full transition-colors ${
            stage !== "rejected" ? "bg-primary" : "bg-border"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors ${
            stage === "writing" ||
            stage === "designing" ||
            stage === "waiting" ||
            stage === "approved" ||
            stage === "published"
              ? "bg-primary"
              : "bg-border"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors ${
            stage === "designing" ||
            stage === "waiting" ||
            stage === "approved" ||
            stage === "published"
              ? "bg-primary"
              : "bg-border"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors ${
            stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-primary"
              : "bg-border"
          }`}
        />
      </div>

      {/* Stage indicator badge */}
      <div className="mb-4 flex items-center justify-between">
        {stage === "finding" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg" aria-hidden="true" />
            Finding topics
          </Badge>
        )}
        {stage === "writing" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg" aria-hidden="true" />
            Writing
          </Badge>
        )}
        {stage === "designing" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg" aria-hidden="true" />
            Designing
          </Badge>
        )}
        {stage === "waiting" && (
          <Badge variant="draft" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-status-draft-fg" aria-hidden="true" />
            Waiting for your approval
          </Badge>
        )}
        {stage === "approved" && (
          <Badge variant="approved" className="gap-1.5">
            <Loader2 className="size-3 animate-spin text-primary" aria-hidden="true" />
            Approved
          </Badge>
        )}
        {stage === "published" && (
          <Badge variant="published" className="gap-1.5">
            <Check className="size-3 text-primary" aria-hidden="true" />
            Published, live on LinkedIn
          </Badge>
        )}
        {stage === "rejected" && (
          <Badge variant="danger" className="gap-1.5">
            Rejected
          </Badge>
        )}

        <span className="text-caption text-muted-foreground">Draft preview</span>
      </div>

      {/* Realistic LinkedIn Draft Card */}
      <div className="rounded-md border border-border bg-card p-4 mb-4">
        {/* Author info */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="size-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-caption font-bold shrink-0"
            aria-hidden="true"
          >
            AM
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-meta text-foreground truncate">
              Alex Morgan
            </p>
            <p className="text-caption text-muted-foreground truncate">
              Product Architect
            </p>
          </div>
        </div>

        {/* Post body */}
        <div className="text-meta text-foreground space-y-1.5 mb-3 leading-relaxed">
          <p className="font-medium text-foreground">
            Teams that track customer outcomes ship with higher clarity.
          </p>
          <p className="text-muted-foreground">
            When retention stalls, adding more features rarely fixes the underlying issue. Review completed user journeys every week.
          </p>
          <p className="text-primary font-medium text-caption pt-0.5">
            #ProductStrategy #EngineeringLeadership
          </p>
        </div>

        {/* Branded image card in two colors */}
        <div
          className="w-full rounded-md bg-primary p-4 text-primary-foreground flex flex-col justify-between"
          role="img"
          aria-label="Branded quote graphic: Teams that track customer outcomes ship with higher clarity"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-caption font-semibold tracking-wider text-signal-line uppercase">
              AutoPulse Insight
            </span>
            <span className="text-caption opacity-80 tabular-nums">08:00 AM</span>
          </div>
          <p className="text-meta font-semibold leading-snug mb-4">
            &ldquo;Teams that track customer outcomes ship with higher clarity.&rdquo;
          </p>
          <div className="flex items-center justify-between text-caption opacity-80 pt-2 border-t border-primary-foreground/20">
            <span>autopulse.ai</span>
            <span>Verified draft</span>
          </div>
        </div>
      </div>

      {/* Interactive controls */}
      <div>
        {stage === "rejected" ? (
          <div className="space-y-2">
            <p className="text-caption text-muted-foreground">
              Draft was rejected. Nothing was published to your LinkedIn profile.
            </p>
            <Button
              type="button"
              variant="default"
              onClick={handleReplay}
              className="w-full"
            >
              Write another
            </Button>
          </div>
        ) : stage === "published" ? (
          <div className="p-3 rounded-md bg-signal-soft border border-signal-line text-left">
            <p className="text-meta font-medium text-primary">
              Published directly to LinkedIn through the official API.
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
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReject}
              disabled={stage !== "waiting"}
              className="flex-1"
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
