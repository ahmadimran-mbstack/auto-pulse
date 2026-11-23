"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleX,
  Copy,
  LoaderCircle,
  PenLine,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LimitMeter } from "@/components/app/ProgressBars";
import {
  ApiClientError,
  getPlaygroundRunEvents,
  type RunEventItem,
  type RunEventsResponse,
} from "@/lib/api";
import { customizationKeys, getCompiledContext } from "@/lib/customization";
import {
  invalidateEntitlements,
  queryKeys,
  useCancelPlaygroundRunMutation,
  useCreatePlaygroundRunMutation,
  useEntitlements,
  useProfileQuery,
  useRunQuery,
} from "@/lib/queries";
import { UpgradeDialog } from "@/components/app/UpgradeDialog";
import { AgentActivityPanel } from "./AgentActivityPanel";

export interface AgentDraftMetadata {
  topic_title?: string;
  angle?: string;
  ai_score?: number;
  image_headline?: string;
  sources?: unknown[];
  first_comment?: string;
}

interface AgentPlaygroundProps {
  userId: string;
  onUseInComposer?: (text: string, metadata?: AgentDraftMetadata) => void;
}

const PLAIN_FAIL_MESSAGE = "We could not finish this draft. Try again.";

const TERMINAL_STATUSES = new Set([
  "done",
  "succeeded",
  "completed",
  "failed",
  "failed_quality",
  "failed_error",
  "timed_out",
  "interrupted",
  "cancelled",
]);

export function AgentPlayground({ userId, onUseInComposer }: AgentPlaygroundProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const initialUrlRunId = searchParams.get("run");

  const [topicHint, setTopicHint] = React.useState("");
  const [runId, setRunId] = React.useState<string | null>(initialUrlRunId);
  const [events, setEvents] = React.useState<RunEventItem[]>([]);
  const [lastSeq, setLastSeq] = React.useState<number>(0);
  const [runStatus, setRunStatus] = React.useState<string | undefined>(undefined);
  const [elapsedSeconds, setElapsedSeconds] = React.useState<number>(0);
  const [isTabHidden, setIsTabHidden] = React.useState<boolean>(
    typeof document !== "undefined" ? document.visibilityState === "hidden" : false
  );

  // Editor state & confirm-before-replace prompt state
  const [editorText, setEditorText] = React.useState<string>("");
  const [firstComment, setFirstComment] = React.useState<string>("");
  const [pendingPost, setPendingPost] = React.useState<{
    text: string;
    firstComment?: string;
    metadata?: AgentDraftMetadata;
  } | null>(null);
  const [appliedRunId, setAppliedRunId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [copiedComment, setCopiedComment] = React.useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = React.useState(true);

  const createMutation = useCreatePlaygroundRunMutation();
  const cancelMutation = useCancelPlaygroundRunMutation();
  const { data: profile, isLoading: isProfileLoading } = useProfileQuery(userId);
  const { data: ent } = useEntitlements(userId);
  const [upgradeError, setUpgradeError] = React.useState<ApiClientError | null>(null);
  const hasNiche = Boolean(profile?.niche_description?.trim());

  const contextQuery = useQuery({
    queryKey: customizationKeys.context(),
    queryFn: getCompiledContext,
    retry: false,
  });

  const policyMin = contextQuery.data?.compiled?.policy?.length_min ?? 800;
  const policyMax = contextQuery.data?.compiled?.policy?.length_max ?? 1200;

  const isTerminal = Boolean(runStatus && TERMINAL_STATUSES.has(runStatus));
  const isRunning = Boolean(runId && !isTerminal);

  React.useEffect(() => {
    if (isTerminal) {
      invalidateEntitlements(userId);
    }
  }, [isTerminal, userId]);

  const pgLimit = ent?.usage.playground_limit ?? null;
  const pgUsed = ent?.usage.playground_used ?? 0;
  const pgLeft = pgLimit !== null ? Math.max(0, pgLimit - pgUsed) : null;
  const pgTodayLimit = ent?.usage.playground_today_limit ?? null;
  const pgTodayUsed = ent?.usage.playground_today_used ?? 0;
  const isExpired = ent?.status === "expired";
  const isMonthlyReached = pgLeft !== null && pgLeft <= 0;
  const isDailyReached = pgTodayLimit !== null && pgTodayUsed >= pgTodayLimit;
  const quotaBlockedReason = isExpired
    ? "Your plan has expired."
    : isMonthlyReached
      ? `You have used all ${pgLimit} Playground runs this period.`
      : isDailyReached
        ? `Daily limit reached (${pgTodayUsed} of ${pgTodayLimit} today). Try again tomorrow.`
        : null;

  const syncRunIdToUrl = React.useCallback(
    (nextId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextId) {
        params.set("run", nextId);
      } else {
        params.delete("run");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      setIsTabHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || runId) return;
    fetch(`/api/v1/playground/runs/active`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((activeRun) => {
        if (activeRun && activeRun.id) {
          setRunId(activeRun.id);
          setRunStatus(activeRun.status);
          syncRunIdToUrl(activeRun.id);
          if (activeRun.elapsed_seconds) {
            setElapsedSeconds(Math.floor(activeRun.elapsed_seconds));
          }
        }
      })
      .catch(() => { });
  }, [runId, syncRunIdToUrl]);

  React.useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const eventsQuery = useQuery<RunEventsResponse>({
    queryKey: ["playground-events", userId, runId, lastSeq],
    queryFn: () => getPlaygroundRunEvents(runId!, lastSeq),
    enabled: Boolean(userId && runId && !isTerminal && !isTabHidden),
    refetchIntervalInBackground: false,
    refetchInterval: () => {
      if (isTerminal || isTabHidden) return false;
      return elapsedSeconds >= 30 ? 2000 : 1000;
    },
    staleTime: 0,
  });

  const { data: runData } = useRunQuery(
    userId,
    runId,
    Boolean(runId && !isTerminal && !isTabHidden) ? 2000 : false
  );

  React.useEffect(() => {
    const data = eventsQuery.data;
    if (!data) return;
    if (data.status) {
      setRunStatus(data.status);
    }
    if (data.events && data.events.length > 0) {
      setEvents((prev) => {
        const existingSeqs = new Set(prev.map((e) => e.seq));
        const fresh = data.events.filter((e) => !existingSeqs.has(e.seq));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh];
      });
      setLastSeq(data.last_seq);
    }
  }, [eventsQuery.data]);

  React.useEffect(() => {
    if (!runData) return;
    if (runData.status) {
      setRunStatus(runData.status);
    }
    if (typeof runData.elapsed_seconds === "number" && runData.elapsed_seconds > elapsedSeconds) {
      setElapsedSeconds(Math.floor(runData.elapsed_seconds));
    }
  }, [runData, elapsedSeconds]);

  React.useEffect(() => {
    if (!runId || appliedRunId === runId) return;

    const completedEvt = [...events].reverse().find((e) => e.type === "run_completed");
    const draftObj =
      (completedEvt?.payload?.final_post as Record<string, unknown> | undefined) ||
      (runStatus === "succeeded" || runStatus === "completed"
        ? (runData?.result as Record<string, unknown> | undefined) ||
        (runData?.best_draft as Record<string, unknown> | undefined)
        : runStatus === "cancelled"
          ? (runData?.best_draft as Record<string, unknown> | undefined)
          : undefined);

    const postText = draftObj?.post_text || draftObj?.caption;
    if (!postText || typeof postText !== "string") return;

    const fc = typeof draftObj?.first_comment === "string" ? draftObj.first_comment.trim() : "";

    const meta: AgentDraftMetadata = {
      topic_title: (runData?.trace as Record<string, unknown> | undefined)?.topic_title as string | undefined,
      angle: ((runData?.trace as Record<string, unknown> | undefined)?.finder as Record<string, unknown> | undefined)?.angle as string | undefined,
      image_headline: draftObj?.image_headline as string | undefined,
      first_comment: fc || undefined,
    };

    setAppliedRunId(runId);

    if (editorText.trim().length > 0) {
      setPendingPost({ text: postText, firstComment: fc, metadata: meta });
    } else {
      setEditorText(postText);
      setFirstComment(fc);
      toast.success("Post saved to Drafts and ready in editor");
    }

    qc.invalidateQueries({ queryKey: queryKeys.all(userId) });
  }, [events, runData, runId, runStatus, appliedRunId, editorText, qc, userId]);

  const handleStartRun = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isRunning || createMutation.isPending || !hasNiche) return;

    try {
      const res = await createMutation.mutateAsync(topicHint.trim() || undefined);
      setEvents([]);
      setLastSeq(0);
      setElapsedSeconds(0);
      setRunStatus(res.status || "queued");
      setAppliedRunId(null);
      setPendingPost(null);
      setRunId(res.run_id);
      syncRunIdToUrl(res.run_id);
      invalidateEntitlements(userId);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 403) {
        setUpgradeError(err);
      } else {
        toast.error(PLAIN_FAIL_MESSAGE);
      }
    }
  };

  const handleCancelRun = async () => {
    if (!runId || cancelMutation.isPending) return;
    try {
      const res = await cancelMutation.mutateAsync(runId);
      setRunStatus(res.status || "cancelled");
      toast.info("Run stopped");
    } catch {
      toast.error("Could not stop right now");
    }
  };

  const handleCopy = async () => {
    if (!editorText.trim()) return;
    await navigator.clipboard.writeText(editorText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyComment = async () => {
    if (!firstComment.trim()) return;
    await navigator.clipboard.writeText(firstComment);
    setCopiedComment(true);
    toast.success("First comment copied");
    setTimeout(() => setCopiedComment(false), 2000);
  };

  const isFailedError =
    runStatus === "failed_error" ||
    runStatus === "failed" ||
    runStatus === "timed_out" ||
    runStatus === "interrupted" ||
    events.some((e) => e.type === "run_failed");

  const traceObj = (runData?.trace || {}) as Record<string, unknown>;
  const failingGates = (runData as unknown as Record<string, unknown> | undefined)?.failing_gates;
  const needsReview = Boolean(
    traceObj.needs_review ||
    (Array.isArray(failingGates) && failingGates.length > 0)
  );

  return (
    <div className="space-y-4">
      {/* Topic input card */}
      <Card className="border border-border bg-card shadow-none rounded-lg">
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleStartRun} className="space-y-2">
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
                disabled={isRunning || createMutation.isPending}
                className="flex-1 text-sm bg-card"
              />
              <Button
                type="submit"
                disabled={isRunning || createMutation.isPending || (!isProfileLoading && !hasNiche) || Boolean(quotaBlockedReason)}
                className="sm:w-auto font-medium text-sm gap-2"
              >
                {createMutation.isPending || isRunning ? (
                  <>
                    <LoaderCircle className="size-4 stroke-[1.75] animate-spin motion-reduce:animate-none" />
                    <span>Writing...</span>
                  </>
                ) : (
                  <>
                    <PenLine className="size-4 stroke-[1.75]" />
                    <span>Write with agents</span>
                  </>
                )}
              </Button>
            </div>
            {pgLeft !== null && pgLimit !== null && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {pgLeft} of {pgLimit} runs left this month
                {pgTodayLimit !== null ? ` · today ${pgTodayUsed} of ${pgTodayLimit}` : ""}
              </p>
            )}
            {quotaBlockedReason ? (
              <p className="text-xs text-status-danger-fg">
                {quotaBlockedReason}{" "}
                <Link href="/app/billing" className="underline font-medium">
                  Upgrade plan
                </Link>
              </p>
            ) : !isProfileLoading && !hasNiche ? (
              <p className="text-xs text-status-danger-fg">
                Your niche description is empty.{" "}
                <Link href="/app/settings?tab=content" className="underline font-medium">
                  Fill it in Settings
                </Link>{" "}
                before running the writing agents.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave empty to let AutoPulse choose a topic from your profile.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Plain error banner only for real failures */}
      {isFailedError && (
        <Alert className="border-status-danger-border bg-status-danger-bg text-status-danger-fg">
          <CircleX className="size-4 stroke-[1.75]" />
          <AlertTitle className="font-medium">Could not complete run</AlertTitle>
          <AlertDescription className="text-xs mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{PLAIN_FAIL_MESSAGE}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleStartRun()}
              className="h-8 text-xs shrink-0 font-medium bg-card text-foreground"
            >
              <RotateCcw className="size-4 stroke-[1.75] mr-1.5" />
              <span>Retry</span>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Ask before replacing existing text in editor */}
      {pendingPost && (
        <Alert className="border-border bg-card">
          <AlertTitle className="text-sm font-medium text-foreground">
            Replace your current draft with the new post?
          </AlertTitle>
          <AlertDescription className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setEditorText(pendingPost.text);
                setFirstComment(pendingPost.firstComment || "");
                setPendingPost(null);
                toast.success("Replaced draft with new post");
              }}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPendingPost(null)}
            >
              Keep mine
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Responsive layout: Editor + Activity changelog */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {runId && (
          <div className="lg:col-span-5 lg:order-2 space-y-2">
            <div className="lg:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMobilePanelOpen((prev) => !prev)}
                className="w-full justify-between text-xs bg-card"
              >
                <span>Agent activity</span>
                {mobilePanelOpen ? (
                  <ChevronUp className="size-4 stroke-[1.75]" />
                ) : (
                  <ChevronDown className="size-4 stroke-[1.75]" />
                )}
              </Button>
            </div>
            <div className={mobilePanelOpen ? "block" : "hidden lg:block"}>
              <AgentActivityPanel
                events={events}
                status={runStatus}
                elapsedSeconds={elapsedSeconds}
                isRunning={isRunning}
                needsReview={needsReview}
                onCancel={handleCancelRun}
                isCancelling={cancelMutation.isPending}
              />
            </div>
          </div>
        )}

        <div className={runId ? "lg:col-span-7 lg:order-1 space-y-4" : "lg:col-span-12 space-y-4"}>
          <Card className="border border-border bg-card shadow-none rounded-lg">
            <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm font-medium text-foreground">
                Post editor
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!editorText.trim()}
                  className="h-8 text-xs gap-1.5"
                >
                  {copied ? (
                    <Check className="size-4 stroke-[1.75]" />
                  ) : (
                    <Copy className="size-4 stroke-[1.75]" />
                  )}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
                {onUseInComposer && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!editorText.trim()}
                    onClick={() => onUseInComposer(editorText)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <span>Open in Composer</span>
                    <ArrowUpRight className="size-4 stroke-[1.75]" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <Textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                placeholder="Your generated LinkedIn post will appear here, or start typing your own draft..."
                className="min-h-[360px] resize-y text-sm leading-relaxed bg-card border-border focus-visible:ring-1"
              />
              <LimitMeter
                current={editorText.length}
                min={policyMin}
                max={policyMax}
              />
            </CardContent>
          </Card>

          {firstComment.trim().length > 0 && (
            <Card className="border border-border bg-card shadow-none rounded-lg">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border flex flex-row items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-sm font-medium text-foreground">
                    First comment
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Paste this as your first comment after publishing.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyComment}
                  className="h-8 text-xs gap-1.5"
                >
                  {copiedComment ? (
                    <Check className="size-4 stroke-[1.75]" />
                  ) : (
                    <Copy className="size-4 stroke-[1.75]" />
                  )}
                  <span>{copiedComment ? "Copied" : "Copy"}</span>
                </Button>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {firstComment}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <UpgradeDialog
        error={upgradeError}
        currentPlanId={ent?.plan_id}
        onClose={() => setUpgradeError(null)}
      />
    </div>
  );
}
