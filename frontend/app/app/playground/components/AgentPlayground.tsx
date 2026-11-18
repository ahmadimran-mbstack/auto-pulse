"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getPlaygroundRunEvents,
  type RunEventItem,
  type RunEventsResponse,
} from "@/lib/api";
import {
  queryKeys,
  useCancelPlaygroundRunMutation,
  useCreatePlaygroundRunMutation,
  useProfileQuery,
  useRunQuery,
} from "@/lib/queries";
import { AgentActivityPanel } from "./AgentActivityPanel";

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

const PLAIN_FAIL_MESSAGE =
  "We could not write your post right now. Please try again in a moment.";

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
  const [pendingPost, setPendingPost] = React.useState<{
    text: string;
    metadata?: AgentDraftMetadata;
  } | null>(null);
  const [appliedRunId, setAppliedRunId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = React.useState(true);

  const createMutation = useCreatePlaygroundRunMutation();
  const cancelMutation = useCancelPlaygroundRunMutation();
  const { data: profile, isLoading: isProfileLoading } = useProfileQuery(userId);
  const hasNiche = Boolean(profile?.niche_description?.trim());

  const isTerminal = Boolean(runStatus && TERMINAL_STATUSES.has(runStatus));
  const isRunning = Boolean(runId && !isTerminal);

  // Sync URL ?run=ID using Next.js router so browser history stays intact
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

  // Pause polling when the browser tab is hidden
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      setIsTabHidden(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Reconnect to any active run on mount if URL had no ?run=ID
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
      .catch(() => {});
  }, [runId, syncRunIdToUrl]);

  // Increment elapsed timer once per second while active
  React.useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  // Cursor-based React Query polling on /playground/runs/{runId}/events?after_seq=lastSeq
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

  // Fetch run details once finished (or on reconnect) to hydrate draft & elapsed time
  const { data: runData } = useRunQuery(
    userId,
    runId,
    Boolean(runId && !isTerminal && !isTabHidden) ? 2000 : false
  );

  // Append newly arrived events and advance cursor
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

  // Sync terminal status and elapsed time from runData
  React.useEffect(() => {
    if (!runData) return;
    if (runData.status) {
      setRunStatus(runData.status);
    }
    if (typeof runData.elapsed_seconds === "number" && runData.elapsed_seconds > elapsedSeconds) {
      setElapsedSeconds(Math.floor(runData.elapsed_seconds));
    }
  }, [runData, elapsedSeconds]);

  // Apply completed draft (or clean best draft after cancel) to the editor
  React.useEffect(() => {
    if (!runId || appliedRunId === runId) return;

    const completedEvt = [...events].reverse().find((e) => e.type === "run_completed");
    const draftObj =
      (completedEvt?.payload?.final_post as Record<string, any> | undefined) ||
      (runStatus === "succeeded" || runStatus === "completed"
        ? (runData?.result as Record<string, any> | undefined) ||
          (runData?.best_draft as Record<string, any> | undefined)
        : runStatus === "cancelled"
        ? (runData?.best_draft as Record<string, any> | undefined)
        : undefined);

    const postText = draftObj?.post_text || draftObj?.caption;
    if (!postText || typeof postText !== "string") return;

    const meta: AgentDraftMetadata = {
      topic_title: (runData?.trace as any)?.topic_title,
      angle: (runData?.trace as any)?.finder?.angle,
      ai_score:
        completedEvt?.payload?.ai_score ?? (runData?.trace as any)?.final_score,
      image_headline: draftObj?.image_headline,
      sources: (runData?.trace as any)?.finder?.sources,
    };

    setAppliedRunId(runId);

    if (editorText.trim().length > 0) {
      setPendingPost({ text: postText, metadata: meta });
    } else {
      setEditorText(postText);
      toast.success("Post saved to Drafts and ready in editor");
    }

    // Refresh Posts and Dashboard caches so the new draft shows under Drafts right away
    qc.invalidateQueries({ queryKey: queryKeys.all(userId) });
  }, [events, runData, runId, runStatus, appliedRunId, editorText, qc, userId]);

  // Start a new run (double-click safe, requires a filled profile niche)
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
    } catch {
      toast.error(PLAIN_FAIL_MESSAGE);
    }
  };

  const handleCancelRun = async () => {
    if (!runId || cancelMutation.isPending) return;
    try {
      const res = await cancelMutation.mutateAsync(runId);
      setRunStatus(res.status || "cancelled");
      toast.info("Run cancelled");
    } catch {
      toast.error("Could not cancel right now");
    }
  };

  const handleCopy = async () => {
    if (!editorText.trim()) return;
    await navigator.clipboard.writeText(editorText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const isFailedError =
    runStatus === "failed_error" ||
    runStatus === "failed" ||
    runStatus === "timed_out" ||
    runStatus === "interrupted" ||
    events.some((e) => e.type === "run_failed");

  const failEvent = [...events].reverse().find((e) => e.type === "run_failed");
  const failMessage = failEvent?.message || PLAIN_FAIL_MESSAGE;

  return (
    <div className="space-y-4">
      {/* Top prompt bar & Generate button */}
      <Card className="border border-border bg-card shadow-none">
        <CardContent className="pt-5">
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
                disabled={isRunning || createMutation.isPending || (!isProfileLoading && !hasNiche)}
                className="sm:w-auto font-normal text-sm gap-2"
              >
                {createMutation.isPending || isRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Writing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    <span>Write with agents</span>
                  </>
                )}
              </Button>
            </div>
            {!isProfileLoading && !hasNiche ? (
              <p className="text-xs text-destructive">
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

      {/* Plain error banner only for real run_failed technical failures */}
      {isFailedError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle className="font-medium">Could not complete run</AlertTitle>
          <AlertDescription className="text-xs mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{failMessage}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleStartRun()}
              className="h-8 text-xs shrink-0 font-normal"
            >
              <RotateCcw className="size-3.5 mr-1.5" />
              <span>Retry</span>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Ask before replacing existing text in editor */}
      {pendingPost && (
        <Alert className="border-border bg-card">
          <AlertTitle className="text-sm font-medium">
            Replace your current draft with the new post?
          </AlertTitle>
          <AlertDescription className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-normal"
              onClick={() => {
                setEditorText(pendingPost.text);
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
              className="h-8 text-xs font-normal"
              onClick={() => setPendingPost(null)}
            >
              Keep mine
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Responsive layout: mobile puts collapsible Agent activity above editor; desktop puts editor beside activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Mobile collapsible activity wrapper + Desktop right column */}
        {runId && (
          <div className="lg:col-span-5 lg:order-2 space-y-2">
            <div className="lg:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMobilePanelOpen((prev) => !prev)}
                className="w-full justify-between text-xs font-normal bg-card"
              >
                <span>Agent activity</span>
                {mobilePanelOpen ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </div>
            <div className={mobilePanelOpen ? "block" : "hidden lg:block"}>
              <AgentActivityPanel
                events={events}
                status={runStatus}
                elapsedSeconds={elapsedSeconds}
                isRunning={isRunning}
                onCancel={handleCancelRun}
                isCancelling={cancelMutation.isPending}
              />
            </div>
          </div>
        )}

        {/* Editor panel (full width before a run starts, 7 cols beside activity panel during/after a run) */}
        <div className={runId ? "lg:col-span-7 lg:order-1" : "lg:col-span-12"}>
          <Card className="border border-border bg-card shadow-none">
            <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-foreground">
                  Post editor
                </CardTitle>
                {editorText.length > 0 && (
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {editorText.length} chars
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!editorText.trim()}
                  className="h-8 text-xs font-normal"
                >
                  {copied ? (
                    <Check className="size-3.5 mr-1.5" />
                  ) : (
                    <Copy className="size-3.5 mr-1.5" />
                  )}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
                {onUseInComposer && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!editorText.trim()}
                    onClick={() => onUseInComposer(editorText)}
                    className="h-8 text-xs font-normal"
                  >
                    <span>Open in Composer</span>
                    <ArrowRight className="size-3.5 ml-1.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                placeholder="Your generated LinkedIn post will appear here, or start typing your own draft..."
                className="min-h-[360px] resize-y text-sm leading-relaxed bg-card border-border focus-visible:ring-1"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
