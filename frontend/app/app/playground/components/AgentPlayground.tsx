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
  Search,
  Target,
  PenTool,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Zap,
  Activity,
  Layers,
  FileText,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PostTraceSheet } from "@/components/app/PostTraceSheet";
import { useCreatePlaygroundRunMutation, useRunQuery } from "@/lib/queries";
import type { AgentTrace } from "@/types/posts";

export interface AgentDraftMetadata {
  topic_title?: string;
  angle?: string;
  ai_score?: number;
  image_headline?: string;
  sources?: any[];
}

interface AgentPlaygroundProps {
  userId: string;
  onUseInComposer?: (text: string, metadata?: AgentDraftMetadata) => void;
}

interface SubstepItem {
  id: string;
  title: string;
  detail: string;
  isActive: (step: string, round: number) => boolean;
  isDone: (step: string, round: number, stageIdx: number, activeIdx: number) => boolean;
}

interface StageDefinition {
  id: number;
  agentTag: string;
  name: string;
  role: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  substeps: SubstepItem[];
}

export function AgentPlayground({ userId, onUseInComposer }: AgentPlaygroundProps) {
  const [topicHint, setTopicHint] = React.useState("");
  const [runId, setRunId] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [timedOut, setTimedOut] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [showTrace, setShowTrace] = React.useState(false);
  const [expandedStages, setExpandedStages] = React.useState<Record<number, boolean>>({});

  // Run creation mutation
  const createMutation = useCreatePlaygroundRunMutation();

  // Fast 1000ms polling while agents are active for real-time responsiveness
  const {
    data: runData,
    error: runErrorObj,
    refetch: refetchRun,
  } = useRunQuery(userId, runId, isPolling ? 1000 : false);

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

  const imageHeadline =
    runData?.result?.image_headline ||
    (trace?.final as any)?.image_headline ||
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

  // Determine which agent stage is currently active (0 to 3) or complete (4)
  const isRewriting =
    currentStep === "rewrite" ||
    (currentRound > 0 &&
      (currentStep === "drafter" ||
        currentStep === "detector" ||
        currentStep === "check" ||
        currentStep === "router"));

  let activeStageIndex = 0;
  if (status === "done") {
    activeStageIndex = 4;
  } else if (
    currentStep === "detector" ||
    currentStep === "check" ||
    currentStep === "router" ||
    currentStep === "post_loop"
  ) {
    activeStageIndex = 3;
  } else if (currentStep === "drafter" || currentStep === "rewrite") {
    activeStageIndex = 2;
  } else if (
    currentStep === "gtm_brief" ||
    currentStep === "gtm_review" ||
    currentStep === "gtm"
  ) {
    activeStageIndex = 1;
  } else {
    // queued, plan, search, finder
    activeStageIndex = 0;
  }

  // Automatically shift focus: expand active stage card, keep completed accessible
  React.useEffect(() => {
    if (isPolling) {
      setExpandedStages((prev) => ({
        ...prev,
        [activeStageIndex]: true,
      }));
    }
  }, [activeStageIndex, isPolling]);

  // Stage definitions mirroring real agent pipeline execution
  const stages: StageDefinition[] = React.useMemo(
    () => [
      {
        id: 0,
        agentTag: "Agent 01",
        name: "Market Scanner & Topic Finder",
        role: "Live Signal Detection & Angle Selection",
        description:
          "Formulates targeted search queries, scans current market benchmarks, and selects a high-signal topic with a defensible contrarian angle.",
        icon: Search,
        substeps: [
          {
            id: "s0-plan",
            title: "Query Formulation",
            detail: "Generating 3 targeted search vectors based on your niche and audience",
            isActive: (step) => step === "plan" || step === "queued",
            isDone: (step, _r, stageIdx, activeIdx) =>
              activeIdx > stageIdx ||
              ["search", "finder", "gtm_brief", "drafter", "detector", "check", "router", "completed"].includes(step),
          },
          {
            id: "s0-search",
            title: "Market Intelligence Scan",
            detail: "Searching live articles, benchmark reports, and technical news",
            isActive: (step) => step === "search",
            isDone: (step, _r, stageIdx, activeIdx) =>
              activeIdx > stageIdx ||
              ["finder", "gtm_brief", "drafter", "detector", "check", "router", "completed"].includes(step),
          },
          {
            id: "s0-finder",
            title: "Topic & Angle Selection",
            detail: "Deduplicating past 14-day history and choosing an authentic contrarian take",
            isActive: (step) => step === "finder",
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx,
          },
        ],
      },
      {
        id: 1,
        agentTag: "Agent 02",
        name: "GTM Content Strategist",
        role: "2026 Playbook & Narrative Architecture",
        description:
          "Applies 2026 LinkedIn Playbook heuristics, crafts 3 scroll-stopping hook options above the fold, and blueprints the section progression.",
        icon: Target,
        substeps: [
          {
            id: "s1-rules",
            title: "Playbook Heuristics Audit",
            detail: "Reviewing mobile dwell-time rules, see-more cutoffs, and voice constraints",
            isActive: (step) => step === "gtm_brief",
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx,
          },
          {
            id: "s1-hooks",
            title: "Triple Hook Generation",
            detail: "Formulating 3 distinct scroll-stopping hook options (number-led, contrarian, observation)",
            isActive: (step) => step === "gtm_brief",
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx || Boolean(trace?.gtm_brief?.chosen_hook),
          },
          {
            id: "s1-structure",
            title: "Narrative & Ending Architecture",
            detail: "Designing 4-6 section progression and selecting decisive practitioner ending",
            isActive: (step) => step === "gtm_brief",
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx,
          },
        ],
      },
      {
        id: 2,
        agentTag: "Agent 03",
        name: "Post Drafter (Ghostwriter)",
        role: "Authentic Human Practitioner Voice",
        description:
          "Drafts the LinkedIn post with varied sentence rhythms, enforces balanced length (850-1200 chars), and strips AI cadence and markdown asterisks.",
        icon: PenTool,
        substeps: [
          {
            id: "s2-draft",
            title: "Practitioner Prose Synthesis",
            detail: "Composing grounded narrative with real technical specifics, metrics, and trade-offs",
            isActive: (step, round) => step === "drafter" && round === 0,
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx || Boolean(postText),
          },
          {
            id: "s2-cadence",
            title: "Rhythm & Density Calibration",
            detail: "Mixing 1-line punchy statements with 2-4 sentence descriptive blocks (850-1200 chars)",
            isActive: (step, round) => step === "drafter" && round === 0,
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx || Boolean(postText),
          },
          {
            id: "s2-cleanse",
            title: "Anti-AI Formatting Strip",
            detail: "Ensuring pure plain text: zero markdown asterisks, no emoji bullets, no URL in caption",
            isActive: (step, round) => step === "drafter" && round === 0,
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx || Boolean(postText),
          },
          ...(isRewriting
            ? [
                {
                  id: "s2-rewrite",
                  title: `Surgical Refinement (Round ${currentRound} of ${maxRounds})`,
                  detail: "Surgically eliminating flagged slop patterns while preserving core arguments",
                  isActive: (step: string) => step === "drafter" || step === "rewrite",
                  isDone: (_s: string, _r: number, stageIdx: number, activeIdx: number) =>
                    activeIdx > stageIdx && !isRewriting,
                },
              ]
            : []),
        ],
      },
      {
        id: 3,
        agentTag: "Agent 04",
        name: "AI-Slop Quality Gate",
        role: "Authenticity & Algorithm Safety Audit",
        description:
          "Audits against 60+ banned words, detects repetitive structural cliches, measures hook cutoff visibility, and verifies zero AI slop.",
        icon: ShieldCheck,
        substeps: [
          {
            id: "s3-vocab",
            title: "Banned Vocabulary & Cliches Scan",
            detail: "Scanning for 'delve', 'tapestry', 'game-changer', colon reveals, and participles",
            isActive: (step) => step === "detector",
            isDone: (step, _r, stageIdx, activeIdx) =>
              activeIdx > stageIdx || ["check", "router", "post_loop", "completed"].includes(step),
          },
          {
            id: "s3-checks",
            title: "Deterministic Constraint Check",
            detail: "Validating character length (700-1800), clean hashtags (0-3), and plain text rules",
            isActive: (step) => step === "check",
            isDone: (step, _r, stageIdx, activeIdx) =>
              activeIdx > stageIdx || ["router", "post_loop", "completed"].includes(step),
          },
          {
            id: "s3-score",
            title: "Authenticity Scoring & Gate Pass",
            detail: "Calculating final authenticity score (< 15 threshold) and confirming publication readiness",
            isActive: (step) => step === "router" || step === "post_loop",
            isDone: (_s, _r, stageIdx, activeIdx) => activeIdx > stageIdx || status === "done",
          },
        ],
      },
    ],
    [isRewriting, currentRound, maxRounds, trace, postText, status]
  );

  // Live status ticker message
  const activeAgentMessage = React.useMemo(() => {
    if (status === "done") {
      return "All 4 specialized agents completed. High-signal LinkedIn post generated.";
    }
    if (status === "failed") {
      return "Agent run encountered an issue.";
    }
    if (activeStageIndex === 0) {
      if (currentStep === "plan") return "Agent 01 (Market Scanner): Formulating search vectors...";
      if (currentStep === "search") return "Agent 01 (Market Scanner): Scanning live news & benchmarks...";
      return "Agent 01 (Topic Finder): Selecting high-signal topic and contrarian angle...";
    }
    if (activeStageIndex === 1) {
      return "Agent 02 (GTM Strategist): Engineering 3 scroll-stopping hook options above the fold...";
    }
    if (activeStageIndex === 2) {
      if (isRewriting) {
        return `Agent 03 (Post Drafter): Surgically revising draft (Round ${currentRound} of ${maxRounds})...`;
      }
      return "Agent 03 (Post Drafter): Composing authentic practitioner post (sweet spot: 850-1200 chars)...";
    }
    if (activeStageIndex === 3) {
      if (currentStep === "detector") return "Agent 04 (Quality Gate): Auditing against 60+ banned AI phrases...";
      if (currentStep === "check") return "Agent 04 (Quality Gate): Checking character bounds & plain text rules...";
      return "Agent 04 (Quality Gate): Calculating final authenticity score...";
    }
    return "Agents initialized. Preparing workflow...";
  }, [status, activeStageIndex, currentStep, isRewriting, currentRound, maxRounds]);

  // Overall pipeline completion percentage
  const overallProgressPercent = React.useMemo(() => {
    if (status === "done") return 100;
    if (activeStageIndex === 0) {
      if (currentStep === "search") return 15;
      if (currentStep === "finder") return 22;
      return 10;
    }
    if (activeStageIndex === 1) return 45;
    if (activeStageIndex === 2) {
      return isRewriting ? 60 + Math.min(currentRound * 5, 15) : 65;
    }
    if (activeStageIndex === 3) {
      if (currentStep === "check") return 88;
      if (currentStep === "router" || currentStep === "post_loop") return 95;
      return 82;
    }
    return 5;
  }, [status, activeStageIndex, currentStep, isRewriting, currentRound]);

  // Start new agent execution
  const handleStartRun = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (createMutation.isPending || isPolling) return;

    setTimedOut(false);
    setElapsedSeconds(0);
    setCopied(false);
    setExpandedStages({ 0: true });

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
    setExpandedStages({});
  };

  // Copy post text to clipboard
  const handleCopyText = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Post draft copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleStage = (idx: number) => {
    setExpandedStages((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  // Separate hook above the fold (~180-210 chars) for LinkedIn visual preview
  const hookCutoffIndex = React.useMemo(() => {
    if (!postText || postText.length <= 200) return -1;
    // Look for paragraph break or period near 160-220 chars
    const candidate = postText.slice(0, 220);
    const paraBreak = candidate.indexOf("\n\n");
    if (paraBreak > 80 && paraBreak < 220) return paraBreak;
    const lastPeriod = candidate.lastIndexOf(". ");
    if (lastPeriod > 100) return lastPeriod + 1;
    return 190;
  }, [postText]);

  const hookAboveFold = hookCutoffIndex > 0 ? postText.slice(0, hookCutoffIndex) : postText;
  const bodyBelowFold = hookCutoffIndex > 0 ? postText.slice(hookCutoffIndex).trim() : "";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Input / Control Card */}
      <Card className="border border-border/70 bg-card/60 backdrop-blur-sm shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                  Multi-Agent Post Studio
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono uppercase px-1.5 py-0">
                  2026 Playbook
                </Badge>
              </div>
              <CardDescription className="text-xs sm:text-sm mt-1 text-muted-foreground">
                Four specialized agents research, plan the angle, write, and iteratively remove AI-slop patterns in real time.
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
          <form onSubmit={handleStartRun} className="space-y-3">
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
                  placeholder="e.g. Why connection pooling saturates memory before CPU, or SaaS pricing lessons..."
                  value={topicHint}
                  onChange={(e) => setTopicHint(e.target.value)}
                  disabled={isPolling || createMutation.isPending}
                  className="flex-1 text-sm bg-background/80"
                />
                <Button
                  type="submit"
                  disabled={isPolling || createMutation.isPending}
                  className="sm:w-auto font-medium text-sm gap-2 shadow-xs transition-all"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Starting...</span>
                    </>
                  ) : isPolling ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Agents Active...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Write with agents</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="size-3 text-primary/70 shrink-0" />
                <span>
                  Leave blank to let the Market Scanner detect the freshest industry trend and contrarian angle.
                </span>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Real-Time Agent Execution Pipeline (Visible while running or when inspecting completed run) */}
      {(isPolling || runId) && (
        <Card
          className={`border transition-all duration-300 ${
            isPolling
              ? "border-primary/40 bg-card shadow-md shadow-primary/5"
              : "border-border/60 bg-card/40"
          }`}
        >
          {/* Big-Tech Live Reasoning Telemetry Header */}
          <div className="p-4 sm:p-5 border-b border-border/50 space-y-3 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="relative flex size-2.5">
                  {isPolling ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full size-2.5 bg-primary" />
                    </>
                  ) : status === "done" ? (
                    <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
                  ) : (
                    <span className="relative inline-flex rounded-full size-2.5 bg-muted-foreground" />
                  )}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {status === "done"
                    ? "Agent Pipeline Complete"
                    : "Autonomous Multi-Agent Workflow"}
                </span>
                <Badge
                  variant={status === "done" ? "default" : "secondary"}
                  className="text-[10px] font-mono px-2 py-0 h-5"
                >
                  {status === "done"
                    ? "4 of 4 Agents Completed"
                    : `Agent 0${Math.min(activeStageIndex + 1, 4)} of 04 Active`}
                </Badge>
                {isRewriting && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500 font-mono">
                    Refinement Loop: Round {currentRound}/{maxRounds}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                <div className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  <span>{elapsedSeconds}s elapsed</span>
                </div>
                {status === "done" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTrace(true)}
                    className="h-6 text-[11px] px-2 text-primary hover:text-primary gap-1"
                  >
                    <Layers className="size-3" />
                    <span>View Audit Trace</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Overall Animated Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    status === "done"
                      ? "bg-emerald-500"
                      : "bg-gradient-to-r from-primary/80 via-primary to-accent"
                  }`}
                  style={{ width: `${overallProgressPercent}%` }}
                />
              </div>

              {/* Live Reasoning Terminal Ticker */}
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background/60 px-3 py-1.5 rounded-md border border-border/40 overflow-hidden">
                <Activity className="size-3 text-primary shrink-0 animate-pulse" />
                <span className="truncate">{activeAgentMessage}</span>
              </div>
            </div>
          </div>

          {/* Sequential Agent Stage Cards */}
          <div className="p-4 sm:p-5 space-y-3">
            {stages.map((stage) => {
              const isStageComplete = status === "done" || stage.id < activeStageIndex;
              const isStageActive = !isStageComplete && stage.id === activeStageIndex && isPolling;
              const isStagePending = stage.id > activeStageIndex && status !== "done";
              const isExpanded = Boolean(expandedStages[stage.id] ?? isStageActive);
              const StageIcon = stage.icon;

              return (
                <div
                  key={stage.id}
                  className={`rounded-lg border transition-all duration-200 overflow-hidden ${
                    isStageActive
                      ? "border-primary/60 bg-accent/20 shadow-xs ring-1 ring-primary/20"
                      : isStageComplete
                        ? "border-border/60 bg-muted/15"
                        : "border-border/30 bg-muted/5 opacity-70"
                  }`}
                >
                  {/* Stage Card Header (Clickable to toggle expansion) */}
                  <div
                    onClick={() => toggleStage(stage.id)}
                    className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Step Indicator Avatar */}
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isStageComplete
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : isStageActive
                              ? "bg-primary text-primary-foreground shadow-xs animate-pulse"
                              : "bg-muted text-muted-foreground border border-border/50"
                        }`}
                      >
                        {isStageComplete ? (
                          <Check className="size-4 stroke-[2.5]" />
                        ) : isStageActive ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <StageIcon className="size-4" />
                        )}
                      </div>

                      {/* Titles & Roles */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                            {stage.agentTag}
                          </span>
                          <h4
                            className={`text-xs sm:text-sm font-semibold truncate ${
                              isStageActive ? "text-foreground" : "text-foreground/90"
                            }`}
                          >
                            {stage.name}
                          </h4>
                          {isStageComplete && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0"
                            >
                              Completed
                            </Badge>
                          )}
                          {isStageActive && (
                            <Badge
                              variant="default"
                              className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0 animate-pulse"
                            >
                              In Progress
                            </Badge>
                          )}
                          {isStagePending && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground/60 border-border/40 px-1.5 py-0"
                            >
                              Queued
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                          {stage.role}
                        </p>
                      </div>
                    </div>

                    {/* Stage Chevron Toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Stage Details & Micro-Steps Accordion Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-3 bg-background/40">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {stage.description}
                      </p>

                      {/* Real-time Substeps Timeline */}
                      <div className="space-y-2 pt-1">
                        {stage.substeps.map((substep, subIdx) => {
                          const subDone = substep.isDone(
                            currentStep,
                            currentRound,
                            stage.id,
                            activeStageIndex
                          );
                          const subActive =
                            !subDone &&
                            isStageActive &&
                            substep.isActive(currentStep, currentRound);

                          return (
                            <div
                              key={substep.id || subIdx}
                              className={`flex items-start gap-2.5 p-2 rounded-md text-xs transition-colors ${
                                subActive
                                  ? "bg-accent/40 border border-primary/20 text-foreground"
                                  : subDone
                                    ? "bg-muted/10 text-muted-foreground"
                                    : "text-muted-foreground/50"
                              }`}
                            >
                              <div className="shrink-0 mt-0.5">
                                {subDone ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                                ) : subActive ? (
                                  <Loader2 className="size-3.5 text-primary animate-spin" />
                                ) : (
                                  <Circle className="size-3.5 text-muted-foreground/30" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className={`font-medium ${subActive ? "text-foreground" : ""}`}>
                                  {substep.title}
                                </span>
                                <p className="text-[11px] text-muted-foreground/80 leading-normal">
                                  {substep.detail}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Progressive Intermediate Findings Surface */}
                      {stage.id === 0 && trace?.finder && (
                        <div className="mt-2.5 p-2.5 rounded-md bg-muted/30 border border-border/40 text-xs space-y-1">
                          <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                            Discovered Topic & Angle:
                          </span>
                          <p className="font-medium text-foreground">{trace.finder.topic}</p>
                          <p className="text-[11px] text-muted-foreground">{trace.finder.angle}</p>
                        </div>
                      )}

                      {stage.id === 1 && (trace?.gtm_brief || trace?.gtm) && (
                        <div className="mt-2.5 p-2.5 rounded-md bg-muted/30 border border-border/40 text-xs space-y-1">
                          <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                            Chosen Above-The-Fold Hook:
                          </span>
                          <p className="font-medium text-foreground italic">
                            &ldquo;{(trace.gtm_brief || trace.gtm)?.chosen_hook}&rdquo;
                          </p>
                        </div>
                      )}

                      {stage.id === 2 && postText && (
                        <div className="mt-2.5 p-2.5 rounded-md bg-muted/30 border border-border/40 text-xs flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            Current Draft Length:
                          </span>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {postText.length} characters (Optimal 850–1200)
                          </Badge>
                        </div>
                      )}

                      {stage.id === 3 && aiScore !== null && (
                        <div className="mt-2.5 p-2.5 rounded-md bg-muted/30 border border-border/40 text-xs flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            Final Authenticity Slop Score:
                          </span>
                          <Badge
                            variant={aiScore <= 15 ? "default" : "destructive"}
                            className="font-mono text-[10px]"
                          >
                            Score: {aiScore} / 100 ({aiScore <= 15 ? "Clean Human Tone" : "Review Flagged"})
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
          <AlertDescription className="text-xs mt-1 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span>
                {(runData?.result as any)?.error_detail ||
                  (runData?.result as any)?.message ||
                  runErrorObj?.message ||
                  "The agent run encountered an error while writing or evaluating the post."}
              </span>
              {(((runData?.result as any)?.error_detail || "").includes("billing") ||
                ((runData?.result as any)?.error_detail || "").includes("PERMISSION_DENIED")) && (
                <span className="text-muted-foreground mt-0.5">
                  Tip: Google requires billing to use this project key. Set up billing at{" "}
                  <a
                    href="https://aistudio.google.com/billing"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium text-foreground hover:text-primary"
                  >
                    aistudio.google.com/billing
                  </a>{" "}
                  or generate a fresh free-tier key.
                </span>
              )}
            </div>
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

      {/* Done State - High-Converting LinkedIn Preview Card */}
      {status === "done" && (
        <Card className="border border-border/80 bg-card shadow-sm overflow-hidden">
          {/* Header Bar */}
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-2">
                <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                <CardTitle className="text-base font-semibold">
                  Generated LinkedIn Post
                </CardTitle>
                {aiScore !== null && (
                  <Badge
                    variant={aiScore <= 15 ? "secondary" : "destructive"}
                    className="font-mono text-xs"
                  >
                    Slop Score: {aiScore}/100 {aiScore <= 15 ? "✓ Clean" : "! Needs Review"}
                  </Badge>
                )}
                {postText && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {postText.length} chars {postText.length >= 800 && postText.length <= 1300 ? "• Sweet Spot" : ""}
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

            {needsReview && exitReason && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                <span className="font-medium text-foreground">Review notice: </span>
                <span>{exitReason}</span>
              </p>
            )}
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {/* Companion Image Headline Card (if generated) */}
            {imageHeadline && (
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                    <FileText className="size-3 text-primary" />
                    <span>Companion Image Headline</span>
                  </span>
                  <p className="text-xs sm:text-sm font-semibold text-foreground">
                    &ldquo;{imageHeadline}&rdquo;
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  At most 10 words
                </Badge>
              </div>
            )}

            {/* LinkedIn Post Simulator Box */}
            <div className="rounded-lg border border-border bg-background p-4 sm:p-6 space-y-3 shadow-2xs">
              {/* Simulated LinkedIn Author Header */}
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/30">
                <div className="size-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">
                    Your Profile &bull; Practitioner Voice
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Published via AutoPulse AI &bull; 1st &bull; Just now &bull; 🌐
                  </p>
                </div>
              </div>

              {/* Hook Visualization & Post Text */}
              {hookCutoffIndex > 0 ? (
                <div className="space-y-2">
                  {/* Hook above fold */}
                  <div className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-wrap select-text">
                    {hookAboveFold}
                  </div>

                  {/* Visual See More Cutoff Line */}
                  <div className="relative my-2.5 flex items-center justify-center select-none">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-dashed border-primary/40" />
                    </div>
                    <div className="relative flex justify-center text-[10px] font-mono">
                      <span className="bg-background px-2.5 py-0.5 text-primary/90 rounded-full border border-primary/30 flex items-center gap-1">
                        <Eye className="size-3" />
                        <span>Mobile & Desktop &quot;...see more&quot; fold cutoff (~180-210 chars)</span>
                      </span>
                    </div>
                  </div>

                  {/* Body below fold */}
                  <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap select-text">
                    {bodyBelowFold}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap select-text">
                  {postText || "Draft content was generated without text."}
                </div>
              )}

              {/* Hashtags */}
              {runData?.result?.hashtags && runData.result.hashtags.length > 0 && (
                <div className="pt-2 flex items-center gap-2 flex-wrap border-t border-border/30">
                  {runData.result.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-medium text-primary hover:underline cursor-pointer"
                    >
                      #{tag.replace(/^#/, "")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="pt-3 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/10">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyText(postText)}
                className="h-9 text-xs gap-1.5 w-full sm:w-auto font-medium"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-500" />
                    <span>Copied to clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copy post</span>
                  </>
                )}
              </Button>

              {onUseInComposer && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    const finalAny = trace?.final as any;
                    const finderAny = trace?.finder as any;
                    onUseInComposer(postText, {
                      topic_title: finalAny?.topic || finderAny?.topic,
                      angle: finalAny?.angle || finderAny?.angle,
                      ai_score: finalAny?.score ?? finalAny?.ai_score ?? trace?.final_score,
                      image_headline: finalAny?.image_headline,
                      sources: finderAny?.sources,
                    });
                  }}
                  className="h-9 text-xs gap-1.5 w-full sm:w-auto font-medium shadow-xs"
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
