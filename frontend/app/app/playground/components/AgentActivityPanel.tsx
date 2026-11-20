"use client";

import * as React from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  LoaderCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/app/StatusBadge";
import type { RunEventItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  groupStepsByRound,
  mapEventToFriendlyStep,
  type FriendlyActivityStep,
} from "./activity-steps";

interface AgentActivityPanelProps {
  events: RunEventItem[];
  status?: string;
  elapsedSeconds: number;
  isRunning: boolean;
  needsReview?: boolean;
  onCancel?: () => void;
  isCancelling?: boolean;
}

function StepIcon({ status }: { status: FriendlyActivityStep["status"] }) {
  if (status === "running") {
    return (
      <LoaderCircle
        className="size-4 stroke-[1.75] text-status-info-fg animate-spin motion-reduce:animate-none bg-card"
        aria-hidden="true"
      />
    );
  }
  if (status === "failed") {
    return (
      <CircleX
        className="size-4 stroke-[1.75] text-status-danger-fg bg-card"
        aria-hidden="true"
      />
    );
  }
  return (
    <CircleCheck
      className="size-4 stroke-[1.75] text-status-success-fg bg-card"
      aria-hidden="true"
    />
  );
}

function ChangelogRow({
  step,
  showTechnical,
}: {
  step: FriendlyActivityStep;
  showTechnical: boolean;
}) {
  return (
    <div className="relative pl-6 pb-4 last:pb-0 transition-opacity duration-150 motion-reduce:transition-none">
      <div className="absolute -left-[9px] top-0.5 flex items-center justify-center rounded-full bg-card">
        <StepIcon status={step.status} />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-foreground leading-snug">
            {step.label}
          </p>
          {step.detail && (
            <p className="text-xs text-muted-foreground leading-normal break-words">
              {step.detail}
            </p>
          )}
          {showTechnical && (
            <div className="mt-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground space-y-0.5">
              {step.agentName && (
                <p>
                  <span className="font-medium text-foreground">Agent:</span>{" "}
                  {step.agentName}
                </p>
              )}
              {typeof step.score === "number" && (
                <p className="tabular-nums">
                  <span className="font-medium text-foreground">Score:</span>{" "}
                  {step.score}
                </p>
              )}
              {step.failedRules && step.failedRules.length > 0 && (
                <p className="break-words">
                  <span className="font-medium text-foreground">Failed rules:</span>{" "}
                  {step.failedRules.join(", ")}
                </p>
              )}
              {step.rawMessage && (
                <p className="break-words">{step.rawMessage}</p>
              )}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
          {step.relativeTime}
        </span>
      </div>
    </div>
  );
}

export function AgentActivityPanel({
  events,
  status,
  elapsedSeconds,
  isRunning,
  needsReview = false,
  onCancel,
  isCancelling = false,
}: AgentActivityPanelProps) {
  const [showTechnical, setShowTechnical] = React.useState(false);
  const [collapsedRounds, setCollapsedRounds] = React.useState<Record<number, boolean>>({});
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = React.useRef(true);

  const firstEventTimeMs = React.useMemo(() => {
    const first = events.find((e) => e.time);
    if (!first?.time) return null;
    const parsed = Date.parse(first.time);
    return Number.isNaN(parsed) ? null : parsed;
  }, [events]);

  const steps = React.useMemo(() => {
    return events.map((evt, idx) =>
      mapEventToFriendlyStep(
        evt,
        firstEventTimeMs,
        isRunning && idx === events.length - 1
      )
    );
  }, [events, firstEventTimeMs, isRunning]);

  const { preRound, rounds, postRound } = React.useMemo(
    () => groupStepsByRound(steps),
    [steps]
  );

  // Track whether user is scrolled to bottom
  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 24;
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const isFailed =
    status === "failed_error" ||
    status === "failed" ||
    status === "timed_out" ||
    status === "interrupted" ||
    events.some((e) => e.type === "run_failed");

  const isDone =
    !isRunning &&
    !isFailed &&
    (status === "succeeded" ||
      status === "completed" ||
      status === "done" ||
      events.some((e) => e.type === "run_completed"));

  const badgeStatus = isRunning
    ? "running"
    : isFailed
      ? "run_failed"
      : isDone
        ? needsReview
          ? "review_suggested"
          : "ready_to_post"
        : "running";

  const roundsCount = Math.max(1, rounds.length);

  return (
    <Card className="border border-border bg-card shadow-none rounded-lg">
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="size-4 stroke-[1.75] text-muted-foreground shrink-0" aria-hidden="true" />
          <CardTitle className="text-sm font-medium text-foreground truncate">
            Agent activity
          </CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {elapsedSeconds}s
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={badgeStatus} />
          {isRunning && onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isCancelling}
              className="h-7 px-2 text-xs text-muted-foreground"
            >
              {isCancelling ? "Stopping..." : "Stop"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-[420px] overflow-y-auto pr-1"
        >
          {steps.length === 0 ? (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-2">
              <LoaderCircle className="size-4 stroke-[1.75] animate-spin motion-reduce:animate-none text-status-info-fg" />
              <span>Starting writing agents...</span>
            </div>
          ) : (
            <div className="ml-2 border-l border-border space-y-1">
              {preRound.map((step) => (
                <ChangelogRow
                  key={step.id}
                  step={step}
                  showTechnical={showTechnical}
                />
              ))}

              {rounds.map((rg) => {
                const isCollapsed = Boolean(collapsedRounds[rg.round]);
                return (
                  <div key={rg.round} className="relative pl-6 pb-3">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedRounds((prev) => ({
                          ...prev,
                          [rg.round]: !prev[rg.round],
                        }))
                      }
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-left text-xs hover:bg-muted/70 transition-colors duration-150 cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        {isCollapsed ? (
                          <ChevronRight className="size-4 stroke-[1.75] text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 stroke-[1.75] text-muted-foreground" />
                        )}
                        <span>Round {rg.round}</span>
                      </span>
                      <span
                        className={cn(
                          "truncate",
                          rg.passed ? "text-status-success-fg" : "text-muted-foreground"
                        )}
                      >
                        {rg.outcome}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="mt-3 ml-1 border-l border-border">
                        {rg.steps.map((step) => (
                          <ChangelogRow
                            key={step.id}
                            step={step}
                            showTechnical={showTechnical}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {postRound.map((step) => (
                <ChangelogRow
                  key={step.id}
                  step={step}
                  showTechnical={showTechnical}
                />
              ))}
            </div>
          )}
        </div>

        {isDone && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-foreground tabular-nums">
              Draft ready. {roundsCount} {roundsCount === 1 ? "round" : "rounds"}. {elapsedSeconds}s.
            </p>
            <StatusBadge status={needsReview ? "review_suggested" : "ready_to_post"} />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Label
            htmlFor="technical-details-toggle"
            className="text-xs font-normal text-muted-foreground cursor-pointer"
          >
            Technical details
          </Label>
          <Switch
            id="technical-details-toggle"
            checked={showTechnical}
            onCheckedChange={setShowTechnical}
          />
        </div>
      </CardContent>
    </Card>
  );
}
