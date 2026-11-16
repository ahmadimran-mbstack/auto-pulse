"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  PenTool,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunEventItem } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AgentActivityPanelProps {
  events: RunEventItem[];
  status?: string;
  elapsedSeconds: number;
  isRunning: boolean;
  onCancel?: () => void;
  isCancelling?: boolean;
}

// Motion wrapper that fades and slides in 8px while respecting prefers-reduced-motion
function TimelineMotionItem({ children }: { children: React.ReactNode }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReduced ? 0 : 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Collapsible card showing the chosen topic, fact count, source domains, and facts list
function TopicFinderCard({ event }: { event: RunEventItem }) {
  const [expanded, setExpanded] = React.useState(false);
  const payload = event.payload || {};
  const topicTitle = String(payload.topic_title || event.message || "Selected topic");
  const facts: Array<{ fact: string; domain?: string }> = Array.isArray(payload.facts)
    ? payload.facts
    : [];
  const domains: string[] = Array.isArray(payload.source_domains)
    ? payload.source_domains
    : [];
  const factsCount = Number(payload.facts_count ?? facts.length);
  const sourcesCount = domains.length;

  return (
    <div className="rounded-lg border border-border bg-card p-3.5 text-left space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-xs font-medium text-foreground">Topic finder</span>
        </div>
        <CheckCircle2 className="size-4 text-status-success-fg shrink-0" aria-hidden="true" />
      </div>

      <p className="text-sm font-medium text-foreground">{topicTitle}</p>
      <p className="text-xs text-muted-foreground">
        {factsCount} {factsCount === 1 ? "fact" : "facts"} found from {sourcesCount}{" "}
        {sourcesCount === 1 ? "source" : "sources"}
      </p>

      {facts.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <span>{expanded ? "Hide facts" : "Show facts"}</span>
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {expanded && (
            <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
              {facts.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                  <span className="text-foreground">{item.fact}</span>
                  {item.domain && (
                    <span className="ml-1.5 text-[11px] font-mono text-muted-foreground">
                      ({item.domain})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Card showing the chosen hook style in plain words
function HookStrategistCard({ event }: { event: RunEventItem }) {
  const hookStyle = String(event.payload?.hook_style || "observation");
  return (
    <div className="rounded-lg border border-border bg-card p-3.5 text-left space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-xs font-medium text-foreground">Hook strategist</span>
        </div>
        <CheckCircle2 className="size-4 text-status-success-fg shrink-0" aria-hidden="true" />
      </div>
      <p className="text-xs text-muted-foreground">
        Opening style: <span className="text-foreground">{hookStyle}</span>
      </p>
    </div>
  );
}

// Card showing the writer round and a 2-line preview of the draft
function WriterDraftCard({ event }: { event: RunEventItem }) {
  const roundNum = Number(event.payload?.round || 1);
  const preview = String(event.payload?.preview || "");
  return (
    <div className="rounded-lg border border-border bg-card p-3.5 text-left space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PenTool className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-xs font-medium text-foreground">Writer</span>
          <Badge variant="outline" className="text-[11px] font-normal px-2 py-0">
            Round {roundNum} of up to 4
          </Badge>
        </div>
        <CheckCircle2 className="size-4 text-status-success-fg shrink-0" aria-hidden="true" />
      </div>
      {preview && (
        <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-2 leading-relaxed border-l-2 border-border pl-2.5">
          {preview}
        </p>
      )}
    </div>
  );
}

// Card showing the real AI-writing score gauge and target (under 15)
function CheckerResultCard({ event }: { event: RunEventItem }) {
  const score = Number(event.payload?.ai_score ?? 0);
  const target = Number(event.payload?.target ?? 15);
  const meetsTarget = score < target;
  const barWidth = Math.max(4, Math.min(100, score));

  return (
    <div className="rounded-lg border border-border bg-card p-3.5 text-left space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-xs font-medium text-foreground">AI-writing checker</span>
        </div>
        {meetsTarget && (
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-status-success-fg/30 bg-status-success-bg text-status-success-fg"
          >
            Meets target
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-foreground font-mono">{score} / 100</span>
        <span className="text-muted-foreground">Target: under {target}</span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            meetsTarget ? "bg-status-success-fg" : "bg-foreground/70"
          )}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

// Small plain line for revision notes between rounds
function RevisionNoteRow({ event }: { event: RunEventItem }) {
  return (
    <div className="flex items-start gap-2 px-2 py-1 text-xs text-muted-foreground">
      <Sparkles className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{event.message}</span>
    </div>
  );
}

// Generic status row for agent_started / agent_completed / best_updated
function AgentStatusRow({ event }: { event: RunEventItem }) {
  const isWorking = event.status === "working";
  const isDone = event.status === "done";
  return (
    <div className="flex items-center gap-2.5 px-2 py-1 text-xs">
      {isWorking ? (
        <Loader2 className="size-3.5 animate-spin text-foreground shrink-0" aria-hidden="true" />
      ) : isDone ? (
        <CheckCircle2 className="size-3.5 text-status-success-fg shrink-0" aria-hidden="true" />
      ) : (
        <Circle className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      )}
      {event.agent && (
        <span className="font-medium text-foreground shrink-0">{event.agent}</span>
      )}
      <span className="text-muted-foreground">{event.message}</span>
    </div>
  );
}

// Component registry mapping backend event types to UI components
const EVENT_COMPONENT_REGISTRY: Record<
  string,
  React.ComponentType<{ event: RunEventItem }>
> = {
  topic_chosen: TopicFinderCard,
  hook_chosen: HookStrategistCard,
  draft_ready: WriterDraftCard,
  check_result: CheckerResultCard,
  revision_note: RevisionNoteRow,
  agent_started: AgentStatusRow,
  agent_completed: AgentStatusRow,
  best_updated: AgentStatusRow,
  run_started: AgentStatusRow,
};

export function AgentActivityPanel({
  events,
  status,
  elapsedSeconds,
  isRunning,
  onCancel,
  isCancelling = false,
}: AgentActivityPanelProps) {
  const [showDetailsWhenDone, setShowDetailsWhenDone] = React.useState(false);

  const isSucceeded = status === "succeeded" || status === "completed";
  const isCancelled = status === "cancelled";

  // Find latest completion event or check result for the collapsed summary
  const completedEvent = React.useMemo(
    () => [...events].reverse().find((e) => e.type === "run_completed"),
    [events]
  );
  const lastCheckEvent = React.useMemo(
    () => [...events].reverse().find((e) => e.type === "check_result"),
    [events]
  );

  // Determine active agent status across the 4 main agents
  const activeWorkingEvent = React.useMemo(() => {
    if (!isRunning) return null;
    return [...events].reverse().find((e) => e.status === "working") || null;
  }, [events, isRunning]);

  // Filter out duplicate completed/started noise when a rich card exists for that agent
  const visibleEvents = React.useMemo(() => {
    return events.filter((e) => {
      if (e.type === "run_completed" || e.type === "run_failed") return false;
      if (e.type === "agent_completed") return false;
      // Hide older agent_started rows once the run finishes or newer events arrive
      if (e.type === "agent_started" && (!isRunning || e.seq < (events[events.length - 1]?.seq ?? 0))) {
        return false;
      }
      return Boolean(EVENT_COMPONENT_REGISTRY[e.type]);
    });
  }, [events, isRunning]);

  const latestMessage = events[events.length - 1]?.message || "";

  const finalScore = Number(
    completedEvent?.payload?.ai_score ?? lastCheckEvent?.payload?.ai_score ?? 0
  );
  const roundsUsed = Number(completedEvent?.payload?.rounds_used ?? 1);

  return (
    <Card className="border border-border bg-card shadow-none">
      <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-medium text-foreground">
            Agent activity
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="font-mono">{elapsedSeconds}s</span>
            {isRunning && activeWorkingEvent?.agent && (
              <span>Working: {activeWorkingEvent.agent}</span>
            )}
            {isCancelled && <span>Cancelled</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRunning && onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isCancelling}
              className="h-8 text-xs font-normal"
            >
              {isCancelling ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <XCircle className="size-3.5 mr-1" />
              )}
              <span>Cancel</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {/* Polite screen-reader live region for real-time status announcements */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {latestMessage}
        </div>

        {/* Collapsed summary bar once the run succeeds */}
        {isSucceeded && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <CheckCircle2 className="size-4 text-status-success-fg shrink-0" aria-hidden="true" />
              <span>
                Ready. Refined over {roundsUsed} {roundsUsed === 1 ? "round" : "rounds"}. AI-writing score {finalScore} out of 100.
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDetailsWhenDone((prev) => !prev)}
              className="h-7 px-2 text-xs font-normal shrink-0"
            >
              <span>{showDetailsWhenDone ? "Hide steps" : "View how this was made"}</span>
              {showDetailsWhenDone ? (
                <ChevronUp className="size-3.5 ml-1" />
              ) : (
                <ChevronDown className="size-3.5 ml-1" />
              )}
            </Button>
          </div>
        )}

        {/* Event timeline list (shown while running, on cancel, or when expanded after completion) */}
        {(!isSucceeded || showDetailsWhenDone) && (
          <div className="space-y-2.5">
            {visibleEvents.length === 0 && isRunning && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="size-3.5 animate-spin shrink-0" />
                <span>Starting agents...</span>
              </div>
            )}
            {visibleEvents.map((evt) => {
              const Comp = EVENT_COMPONENT_REGISTRY[evt.type];
              if (!Comp) return null;
              return (
                <TimelineMotionItem key={evt.seq}>
                  <Comp event={evt} />
                </TimelineMotionItem>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

