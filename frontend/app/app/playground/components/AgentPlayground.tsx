"use client";

import * as React from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Circle,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PostTraceSheet } from "@/components/app/PostTraceSheet";
import { useCreatePlaygroundRunMutation, useRunQuery } from "@/lib/queries";
import type { AgentTrace, RunResponse } from "@/types/posts";

interface AgentPlaygroundProps {
  userId: string;
  onUseInComposer?: (text: string) => void;
}

export function AgentPlayground({ userId, onUseInComposer }: AgentPlaygroundProps) {
  const [topicHint, setTopicHint] = React.useState("");
  const [runId, setRunId] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [timedOut, setTimedOut] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [showTrace, setShowTrace] = React.useState(false);

  // Run creation mutation
  const createMutation = useCreatePlaygroundRunMutation(userId);

  // Run polling query (every 2 seconds while isPolling is true)
  const { data: runData, isError: runError, error: runErrorObj, refetch: refetchRun } = useRunQuery(
    userId,
    runId || "",
    {
      enabled: Boolean(runId && isPolling),
      refetchInterval: isPolling ? 2000 : false,
    }
  );

  // 180-second timeout guard with unmount timer cleanup
  React.useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= 180) {
          setIsPolling(false);
          setTimedOut(true);
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isPolling]);

  // Stop polling once the run completes or fails
  React.useEffect(() => {
    if (!runData) return;

    if (runData.status === "done" || runData.status === "failed") {
      setIsPolling(false);
    }
  }, [runData]);

  // Start new agent execution
  const handleStartRun = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (createMutation.isPending || isPolling) return;

    setTimedOut(false);
    setElapsedSeconds(0);
    setCopied(false);

    try {
      const res = await createMutation.mutateAsync(topicHint.trim() || undefined);
      if (res && res.run_id) {
        setRunId(res.run_id);
        setIsPolling(true);
      } else {
        toast.error("Failed to start agent run. Missing run ID.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to trigger run";
      toast.error(message);
    }
  };

  // Reset state to start a new draft
  const handleReset = () => {
    setRunId(null);
    setIsPolling(false);
    setElapsedSeconds(0);
    setTimedOut(false);
    setCopied(false);
  };

  // Copy post text to clipboard
  const handleCopyText = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Post draft copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract run details
  const status = runData?.status;
  const currentStep = runData?.current_step || "queued";
  const currentRound = runData?.round ?? 0;
  const maxRounds = runData?.max_rounds || 3;
  const trace: AgentTrace | null = runData?.trace || runData?.agent_trace || null;

  // Final post content & metrics extraction with fallbacks
  const postText =
    runData?.result?.text ||
    runData?.result?.post_text ||
    runData?.result?.caption ||
    trace?.final?.text ||
    trace?.final?.post_text ||
    "";

  const aiScore =
    runData?.result?.score ??
    runData?.result?.final_score ??
    trace?.final_score ??
    trace?.final?.score ??
    trace?.final?.final_score ??
    null;

  const needsReview = Boolean(
    runData?.result?.needs_review ??
    trace?.needs_review ??
    trace?.final?.needs_review ??
    (aiScore !== null && aiScore > 15)
  );

  const exitReason =
    runData?.result?.exit_reason ||
    trace?.exit_reason ||
    trace?.final?.reason ||
    (runData?.result?.check_failures && runData.result.check_failures.length > 0
      ? `Quality check flags: ${runData.result.check_failures.join(", ")}`
      : needsReview
      ? "AI-slop score was above the threshold or stopped at maximum rounds"
      : null);

  // Compute 4 progress steps
  const isRewriting =
    currentStep === "rewrite" ||
    (currentRound > 0 && (currentStep === "drafter" || currentStep === "detector" || currentStep === "check"));

  const step4Label = isRewriting
    ? `Rewriting, round ${currentRound} of ${maxRounds}`
    : "Checking for AI slop";

  // Determine which step is currently active (0 to 3) or complete (4)
  let activeStepIndex = 0;
  if (status === "done") {
    activeStepIndex = 4;
  } else if (
    currentStep === "detector" ||
    currentStep === "check" ||
    currentStep === "rewrite" ||
    (currentRound > 0 && currentStep === "drafter")
  ) {
    activeStepIndex = 3;
  } else if (currentStep === "drafter") {
    activeStepIndex = 2;
  } else if (
    currentStep === "gtm_brief" ||
    currentStep === "gtm_review" ||
    currentStep === "gtm"
  ) {
    activeStepIndex = 1;
  } else {
    // queued, plan, search, finder
    activeStepIndex = 0;
  }

  const steps = [
    { label: "Finding a topic" },
    { label: "Planning the hook" },
    { label: "Writing the draft" },
    { label: step4Label },
  ];

  // Screen reader polite announcement text
  const liveStatusText = React.useMemo(() => {
    if (status === "done") {
      return needsReview
        ? `Writing agents completed draft with AI-slop score of ${aiScore ?? "unknown"}. Needs your review.`
        : `Writing agents successfully completed draft with AI-slop score of ${aiScore ?? "unknown"}.`;
    }
    if (status === "failed") {
      return "Writing agent run failed.";
    }
    if (timedOut) {
      return "Run is still processing in background after 3 minutes.";
    }
    if (isPolling) {
      return `Agents working: ${steps[activeStepIndex]?.label || "Processing"}.`;
    }
    return "Ready to generate post.";
  }, [status, needsReview, aiScore, timedOut, isPolling, activeStepIndex, steps]);

  return (
    <div className="space-y-6">
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" role="status">
        {liveStatusText}
      </div>

      {/* Input / Control Card */}
      <Card className="border border-card-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span>Multi-Agent Post Studio</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Four specialized agents research, plan the angle, write, and iteratively remove AI-slop patterns.
              </CardDescription>
            </div>
            {runId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs h-8 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3.5 mr-1.5" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleStartRun} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="topic-hint"
                className="text-xs font-medium text-foreground inline-flex items-center gap-1.5"
              >
                <span>Topic or angle hint</span>
                <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="topic-hint"
                  type="text"
                  placeholder="e.g. Why most SaaS pricing models fail, or early architecture lessons..."
                  value={topicHint}
                  onChange={(e) => setTopicHint(e.target.value)}
                  disabled={isPolling || createMutation.isPending}
                  className="flex-1 text-sm bg-background"
                />
                <Button
                  type="submit"
                  disabled={isPolling || createMutation.isPending}
                  className="sm:w-auto font-medium text-sm gap-2"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Starting...</span>
                    </>
                  ) : isPolling ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Agents running...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Write with agents</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave blank to let the Post Finder pick the freshest trend based on your industry and audience.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 4-Step Progress Tracker when running */}
      {isPolling && (
        <Card className="border border-card-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agent Pipeline Execution
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {elapsedSeconds}s elapsed
              </span>
            </div>
          </CardHeader>

          <CardContent>
            <div
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-1"
              role="status"
              aria-label="Agent execution progress"
            >
              {steps.map((step, idx) => {
                const isComplete = idx < activeStepIndex;
                const isCurrent = idx === activeStepIndex;
                const isPending = idx > activeStepIndex;

                return (
                  <div
                    key={step.label}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      isCurrent
                        ? "border-primary/40 bg-accent/30 text-foreground"
                        : isComplete
                        ? "border-border/60 bg-muted/20 text-muted-foreground"
                        : "border-border/30 bg-muted/10 text-muted-foreground/60"
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {isComplete ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : isCurrent ? (
                        <Loader2 className="size-4 animate-spin text-primary" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Step {idx + 1}
                      </p>
                      <p
                        className={`text-xs leading-snug line-clamp-2 ${
                          isCurrent
                            ? "font-semibold text-foreground"
                            : "font-normal"
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeout Alert Guard */}
      {timedOut && (
        <Alert className="border-border bg-muted/30">
          <AlertCircle className="size-4 text-muted-foreground" />
          <AlertTitle>Still running, check back soon</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>
              The agent loop is taking longer than 3 minutes. Your draft is still processing safely in the background.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTimedOut(false);
                  setIsPolling(true);
                  refetchRun();
                }}
                className="h-8 text-xs"
              >
                Check status again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Failure State */}
      {status === "failed" && !timedOut && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Agent Run Failed</AlertTitle>
          <AlertDescription className="text-xs mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>
              {runErrorObj?.message || "The agent run encountered an error while writing or evaluating the post."}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartRun}
              className="h-8 text-xs shrink-0"
            >
              <RotateCcw className="size-3.5 mr-1.5" />
              <span>Retry</span>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Done State - Result Card */}
      {status === "done" && (
        <Card className="border border-card-border bg-card">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center flex-wrap gap-2">
                <CheckCircle2 className="size-5 text-primary shrink-0" />
                <CardTitle className="text-base font-semibold">
                  Generated Post Draft
                </CardTitle>
                {aiScore !== null && (
                  <Badge variant="secondary" className="font-normal text-xs">
                    AI-slop check {aiScore} of 100, lower is better
                  </Badge>
                )}
                {needsReview && (
                  <Badge variant="outline" className="font-normal text-xs">
                    Needs your review
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTrace(true)}
                  className="h-8 text-xs gap-1.5"
                >
                  <HelpCircle className="size-3.5" />
                  <span>How this was written</span>
                </Button>
              </div>
            </div>

            {/* Short line why review is needed */}
            {needsReview && exitReason && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                <span className="font-medium text-foreground">Review notice: </span>
                <span>{exitReason}</span>
              </p>
            )}
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {/* Post Draft Content */}
            <div className="rounded-md border border-border bg-background p-4 sm:p-5 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words select-text">
              {postText || "Draft content was generated without text."}
            </div>

            {/* Hashtags or keywords if present */}
            {runData?.result?.hashtags && runData.result.hashtags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {runData.result.hashtags.map((tag) => (
                  <span key={tag} className="text-xs text-muted-foreground">
                    #{tag.replace(/^#/, "")}
                  </span>
                ))}
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-3 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyText(postText)}
                className="h-9 text-xs gap-1.5 w-full sm:w-auto"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-primary" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copy text</span>
                  </>
                )}
              </Button>

              {onUseInComposer && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onUseInComposer(postText)}
                  className="h-9 text-xs gap-1.5 w-full sm:w-auto"
                >
                  <span>Send to composer</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground h-9"
            >
              Write another draft
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* "How this was written" Sheet Panel */}
      <PostTraceSheet
        open={showTrace}
        onOpenChange={setShowTrace}
        initialTrace={trace}
      />
    </div>
  );
}
