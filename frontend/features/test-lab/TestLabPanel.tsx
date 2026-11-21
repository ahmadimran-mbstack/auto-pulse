"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CircleX,
  Clock,
  Copy,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  SkipForward,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { StatusBadge, type StatusVariant } from "@/components/app/StatusBadge";
import { cn } from "@/lib/utils";
import {
  cancelTestLabRun,
  createTestLabRun,
  getTestLabStatus,
  resetTestLabRun,
  retryTestLabGenerate,
  testLabKeys,
} from "./api";
import type { TestLabRun, TestLabStepErrorDetail, TestLabStepStatus } from "./types";

function getTimezoneOffsetLabel(tz: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC";
    return offsetPart.replace("GMT", "UTC");
  } catch {
    return "UTC";
  }
}

function formatInTimezoneInput(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  } catch {
    return date.toISOString().slice(0, 16);
  }
}

function parseTimezoneInputToUtc(localStr: string, tz: string): Date | null {
  if (!localStr || !localStr.includes("T")) return null;
  const [datePart, timePart] = localStr.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;

  const guessUtc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  try {
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(guessUtc);
    const get = (t: string) => Number(tzParts.find((p) => p.type === t)?.value ?? 0);
    const tzHour = get("hour") === 24 ? 0 : get("hour");
    const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), tzHour, get("minute"), get("second"));
    const offsetMs = asIfUtc - guessUtc.getTime();
    return new Date(guessUtc.getTime() - offsetMs);
  } catch {
    return guessUtc;
  }
}

function formatTimeInTz(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 19);
  }
}

function formatDelay(scheduledIso: string, startedIso?: string | null): string {
  if (!startedIso) return "";
  const sched = new Date(scheduledIso).getTime();
  const start = new Date(startedIso).getTime();
  if (Number.isNaN(sched) || Number.isNaN(start)) return "";
  const sec = Math.max(0, Math.round((start - sched) / 1000));
  if (sec < 60) return `${sec}s late`;
  const mins = Math.round(sec / 60);
  return `${mins} ${mins === 1 ? "minute" : "minutes"} late`;
}

function formatRelativeTime(iso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

const ERROR_COPY: Record<string, string> = {
  no_draft_produced: "The pipeline finished without writing a draft.",
  search_failed: "The topic search step could not reach the search provider.",
  no_candidates: "No fresh topic candidates were found for your profile.",
  db_error: "The writer step could not finish: the database was unreachable.",
  timed_out: "The pipeline timed out before finishing.",
  pipeline_error: "An unexpected error stopped the pipeline.",
};

function getPlainStepError(
  rawError?: string | null,
  detail?: TestLabStepErrorDetail
): string {
  if (detail?.code && ERROR_COPY[detail.code]) {
    return ERROR_COPY[detail.code];
  }
  if (detail?.node) {
    return `The pipeline stopped at ${detail.node}.`;
  }
  return rawError || "This step could not finish.";
}

function getStepBadge(stepStatus: TestLabStepStatus): { variant: StatusVariant; label: string } {
  switch (stepStatus) {
    case "pending":
      return { variant: "neutral", label: "Scheduled" };
    case "running":
      return { variant: "processing", label: "Running" };
    case "completed":
      return { variant: "success", label: "Completed" };
    case "failed":
      return { variant: "danger", label: "Failed" };
    case "cancelled":
      return { variant: "neutral", label: "Cancelled" };
    case "skipped_dry_run":
      return { variant: "warning", label: "Skipped (dry run)" };
    case "skipped_not_approved":
      return { variant: "warning", label: "Skipped, not approved" };
    default:
      return { variant: "neutral", label: stepStatus };
  }
}

export function TestLabPanel() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: testLabKeys.status(),
    queryFn: getTestLabStatus,
    refetchInterval: (q) => {
      const st = q.state.data?.run?.status;
      return st === "scheduled" || st === "running" ? 3000 : false;
    },
  });

  const statusData = statusQuery.data;
  const tz = statusData?.timezone || "UTC";
  const tzOffset = getTimezoneOffsetLabel(tz);
  const activeRun: TestLabRun | null = statusData?.run ?? null;
  const isRunActive = Boolean(activeRun && (activeRun.status === "scheduled" || activeRun.status === "running"));

  const [topicHint, setTopicHint] = React.useState("");
  const [dryRun, setDryRun] = React.useState(false);
  const [generateInput, setGenerateInput] = React.useState("");
  const [approveInput, setApproveInput] = React.useState("");
  const [uploadInput, setUploadInput] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmChecked, setConfirmChecked] = React.useState(false);
  const [initializedTz, setInitializedTz] = React.useState<string | null>(null);
  const [openErrorDetails, setOpenErrorDetails] = React.useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  if (statusData && initializedTz !== tz) {
    setInitializedTz(tz);
    const now = new Date();
    setGenerateInput(formatInTimezoneInput(new Date(now.getTime() + 2 * 60_000), tz));
    setApproveInput(formatInTimezoneInput(new Date(now.getTime() + 4 * 60_000), tz));
    setUploadInput(formatInTimezoneInput(new Date(now.getTime() + 6 * 60_000), tz));
  }

  const genUtc = parseTimezoneInputToUtc(generateInput, tz);
  const appUtc = parseTimezoneInputToUtc(approveInput, tz);
  const uplUtc = parseTimezoneInputToUtc(uploadInput, tz);

  const genError = !genUtc
    ? "Pick a valid generate date and time."
    : genUtc.getTime() < nowMs + 55_000
      ? "Generate time must be at least 1 minute from now."
      : null;

  const appError = !appUtc
    ? "Pick a valid approval date and time."
    : genUtc && appUtc.getTime() < genUtc.getTime() + 60_000
      ? "Approval time must be at least 1 minute after generate time."
      : null;

  const uplError = !uplUtc
    ? "Pick a valid upload date and time."
    : appUtc && uplUtc.getTime() < appUtc.getTime() + 60_000
      ? "Upload time must be at least 1 minute after approval time."
      : uplUtc.getTime() > nowMs + 7 * 24 * 3600_000
        ? "Upload time cannot be more than 7 days ahead."
        : null;

  const hasValidationError = Boolean(genError || appError || uplError);
  const slackBlocked = Boolean(statusData && !statusData.slack_connected);
  const linkedinBlocked = Boolean(statusData && !dryRun && !statusData.linkedin_valid);
  const canSchedule = !isRunActive && !hasValidationError && !slackBlocked && !linkedinBlocked;

  const createMutation = useMutation({
    mutationFn: createTestLabRun,
    onSuccess: () => {
      toast.success("Test Lab run scheduled.");
      setConfirmOpen(false);
      setConfirmChecked(false);
      queryClient.invalidateQueries({ queryKey: testLabKeys.all });
    },
    onError: (err: Error) => toast.error(err.message || "Could not schedule test."),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelTestLabRun(id),
    onSuccess: () => {
      toast.success("Test run cancelled.");
      queryClient.invalidateQueries({ queryKey: testLabKeys.all });
    },
    onError: (err: Error) => toast.error(err.message || "Could not cancel test."),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetTestLabRun(id),
    onSuccess: () => {
      toast.success("Test Lab reset.");
      const now = new Date();
      setGenerateInput(formatInTimezoneInput(new Date(now.getTime() + 2 * 60_000), tz));
      setApproveInput(formatInTimezoneInput(new Date(now.getTime() + 4 * 60_000), tz));
      setUploadInput(formatInTimezoneInput(new Date(now.getTime() + 6 * 60_000), tz));
      queryClient.invalidateQueries({ queryKey: testLabKeys.all });
    },
    onError: (err: Error) => toast.error(err.message || "Could not reset test."),
  });

  const retryGenerateMutation = useMutation({
    mutationFn: (id: string) => retryTestLabGenerate(id),
    onSuccess: () => {
      toast.success("Retrying Step 1 (Generate post)...");
      queryClient.invalidateQueries({ queryKey: testLabKeys.all });
    },
    onError: (err: Error) => toast.error(err.message || "Could not retry step."),
  });

  const submitSchedule = () => {
    if (!genUtc || !appUtc || !uplUtc) return;
    createMutation.mutate({
      topic_hint: topicHint.trim() || undefined,
      dry_run: dryRun,
      generate_at: genUtc.toISOString(),
      approve_at: appUtc.toISOString(),
      upload_at: uplUtc.toISOString(),
    });
  };

  const handleScheduleClick = () => {
    if (!canSchedule) return;
    if (!dryRun) {
      setConfirmChecked(false);
      setConfirmOpen(true);
      return;
    }
    submitSchedule();
  };

  if (statusQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-44 rounded-lg" />
        </div>
      </div>
    );
  }

  if (statusQuery.isError) {
    return (
      <Card className="border border-status-danger-border bg-status-danger-bg p-4">
        <p className="text-sm text-status-danger-fg">
          {(statusQuery.error as Error)?.message || "Test Lab is not available for your account."}
        </p>
      </Card>
    );
  }

  const steps = [
    {
      key: "generate",
      title: "1. Generate post",
      desc: "Runs the real pipeline with your customization context.",
      status: activeRun?.generate_status ?? "pending",
      scheduledIso: activeRun?.generate_at,
      startedIso: activeRun?.generate_started_at,
      finishedIso: activeRun?.generate_finished_at,
      error: activeRun?.generate_error,
      inputVal: generateInput,
      onChangeInput: setGenerateInput,
      inputError: genError,
    },
    {
      key: "approve",
      title: "2. Send for approval",
      desc: "Dispatches the real Slack approval message.",
      status: activeRun?.approve_status ?? "pending",
      scheduledIso: activeRun?.approve_at,
      startedIso: activeRun?.approve_started_at,
      finishedIso: activeRun?.approve_finished_at,
      error: activeRun?.approve_error,
      inputVal: approveInput,
      onChangeInput: setApproveInput,
      inputError: appError,
    },
    {
      key: "upload",
      title: "3. Upload to LinkedIn",
      desc: "Publishes only if approved in Slack (unless Dry run).",
      status: activeRun?.upload_status ?? "pending",
      scheduledIso: activeRun?.upload_at,
      startedIso: activeRun?.upload_started_at,
      finishedIso: activeRun?.upload_finished_at,
      error: activeRun?.upload_error,
      inputVal: uploadInput,
      onChangeInput: setUploadInput,
      inputError: uplError,
    },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Top Dev Banner */}
      <Card className="border border-card-border bg-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <FlaskConical className="size-4 stroke-[1.75] text-status-warning-fg mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  End-to-end schedule &amp; publish test
                </h2>
                <span className="inline-flex items-center rounded-full border border-status-warning-border bg-status-warning-bg px-2.5 py-0.5 text-xs font-medium text-status-warning-fg">
                  Development only
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Pick three times in your configured timezone:{" "}
                <span className="font-medium text-foreground">
                  {tz} ({tzOffset})
                </span>
                . Everything is stored in UTC and runs on the 60s scheduler tick.
              </p>
            </div>
          </div>

          {activeRun && (
            <StatusBadge
              status={activeRun.status}
              variant={
                activeRun.status === "completed"
                  ? "success"
                  : activeRun.status === "failed"
                    ? "danger"
                    : activeRun.status === "cancelled"
                      ? "neutral"
                      : "processing"
              }
              label={
                activeRun.status.charAt(0).toUpperCase() + activeRun.status.slice(1)
              }
            />
          )}
        </div>
      </Card>

      {/* Connection Prechecks */}
      {(slackBlocked || linkedinBlocked) && (
        <div className="space-y-2">
          {slackBlocked && (
            <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-3.5 flex items-center justify-between gap-3">
              <p className="text-xs text-status-danger-fg">
                Slack must be connected for this workspace before scheduling a test.
              </p>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs shrink-0">
                <Link href="/app/connections">Connect Slack</Link>
              </Button>
            </div>
          )}
          {linkedinBlocked && (
            <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-3.5 flex items-center justify-between gap-3">
              <p className="text-xs text-status-danger-fg">
                LinkedIn must be connected with a valid token to run a live upload (or turn on Dry run).
              </p>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs shrink-0">
                <Link href="/app/connections">Check LinkedIn</Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Controls: Topic Hint & Dry Run */}
      <Card className="border border-card-border bg-card p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="test-lab-topic">Topic or angle hint (optional)</Label>
            <Input
              id="test-lab-topic"
              placeholder="e.g. Why connection pooling saturates memory before CPU..."
              value={activeRun ? activeRun.topic_hint ?? "" : topicHint}
              onChange={(e) => setTopicHint(e.target.value)}
              disabled={isRunActive}
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
            <Switch
              id="test-lab-dry-run"
              checked={activeRun ? activeRun.dry_run : dryRun}
              onCheckedChange={setDryRun}
              disabled={isRunActive}
            />
            <div className="space-y-0.5">
              <Label htmlFor="test-lab-dry-run" className="text-sm font-medium cursor-pointer">
                Dry run
              </Label>
              <p className="text-xs text-muted-foreground">
                Skips LinkedIn publish at step 3
              </p>
            </div>
          </div>
        </div>

        {!(activeRun ? activeRun.dry_run : dryRun) && (
          <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-3 flex items-start gap-2.5">
            <TriangleAlert className="size-4 stroke-[1.75] text-status-warning-fg mt-0.5 shrink-0" />
            <p className="text-xs text-status-warning-fg">
              This will publish a real post to your LinkedIn account at the upload time.
            </p>
          </div>
        )}
      </Card>

      {/* Three Step Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => {
          const badge = getStepBadge(s.status);
          const ranTime = formatTimeInTz(s.startedIso, tz);
          const delayLabel =
            s.scheduledIso && s.startedIso ? formatDelay(s.scheduledIso, s.startedIso) : "";

          return (
            <Card key={s.key} className="border border-card-border bg-card flex flex-col">
              <CardHeader className="p-4 pb-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">{s.title}</CardTitle>
                  {activeRun && (
                    <StatusBadge
                      status={s.status}
                      variant={badge.variant}
                      label={badge.label}
                    />
                  )}
                </div>
                <CardDescription className="text-xs">{s.desc}</CardDescription>
              </CardHeader>

              <CardContent className="p-4 pt-0 space-y-3 flex-1">
                <div className="space-y-1.5">
                  <Label htmlFor={`step-time-${s.key}`} className="text-xs text-muted-foreground">
                    Scheduled time ({tzOffset})
                  </Label>
                  <Input
                    id={`step-time-${s.key}`}
                    type="datetime-local"
                    value={
                      activeRun && s.scheduledIso
                        ? formatInTimezoneInput(new Date(s.scheduledIso), tz)
                        : s.inputVal
                    }
                    onChange={(e) => s.onChangeInput(e.target.value)}
                    disabled={isRunActive || Boolean(activeRun)}
                    className="tabular-nums text-xs"
                  />
                  {!activeRun && s.inputError && (
                    <p className="text-xs text-status-danger-fg">{s.inputError}</p>
                  )}
                </div>

                {activeRun && ranTime && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Ran at <span className="font-medium text-foreground">{ranTime}</span>
                    {delayLabel ? `, ${delayLabel}` : ""}
                  </p>
                )}

                {s.key === "upload" && s.status === "skipped_not_approved" && (
                  <p className="text-xs text-status-warning-fg bg-status-warning-bg border border-status-warning-border rounded-md p-2.5">
                    Skipped, not approved: the post was not approved in Slack before the upload time, so nothing was published.
                  </p>
                )}

                {s.status === "cancelled" &&
                  activeRun?.status === "failed" &&
                  (activeRun.generate_status === "failed" || activeRun.approve_status === "failed") && (
                    <p className="text-xs text-muted-foreground">
                      {activeRun.generate_status === "failed"
                        ? "Cancelled because step 1 failed"
                        : "Cancelled because step 2 failed"}
                    </p>
                  )}

                {s.error && (() => {
                  const errDetail = activeRun?.error_details?.[s.key];
                  const plainMsg = getPlainStepError(s.error, errDetail);
                  const detailsOpen = Boolean(openErrorDetails[s.key]);
                  const techText = [
                    errDetail?.code ? `code: ${errDetail.code}` : null,
                    errDetail?.node ? `node: ${errDetail.node}` : null,
                    `message: ${errDetail?.message || s.error}`,
                    errDetail?.stack ? `\n${errDetail.stack}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n");
                  const canRetryStep1 =
                    s.key === "generate" &&
                    activeRun &&
                    activeRun.generate_status === "failed" &&
                    new Date(activeRun.approve_at).getTime() > nowMs + 30_000;

                  return (
                    <div className="rounded-md border border-status-danger-border bg-status-danger-bg p-2.5 space-y-2">
                      <p className="text-xs text-status-danger-fg break-words">{plainMsg}</p>

                      {s.key === "generate" && activeRun?.generate_status === "failed" && (
                        canRetryStep1 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={retryGenerateMutation.isPending}
                            onClick={() => retryGenerateMutation.mutate(activeRun.id)}
                            className="h-7 gap-1.5 text-xs"
                          >
                            <RefreshCw className="size-3.5 stroke-[1.75]" />
                            <span>Retry step</span>
                          </Button>
                        ) : (
                          <p className="text-xs text-status-danger-fg/90">
                            Scheduled times for steps 2 and 3 have passed. Use Reset to schedule a new test.
                          </p>
                        )
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenErrorDetails((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-status-danger-fg/90 hover:text-status-danger-fg cursor-pointer"
                        >
                          {detailsOpen ? (
                            <ChevronDown className="size-3.5 stroke-[1.75]" />
                          ) : (
                            <ChevronRight className="size-3.5 stroke-[1.75]" />
                          )}
                          <span>Details</span>
                        </button>
                        {detailsOpen && (
                          <div className="mt-1.5 space-y-1.5">
                            <pre className="rounded border border-status-danger-border bg-background/60 p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                              {techText}
                            </pre>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard?.writeText(techText);
                                toast.success("Error details copied.");
                              }}
                              className="h-7 gap-1.5 text-xs"
                            >
                              <Copy className="size-3.5 stroke-[1.75]" />
                              <span>Copy</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {!activeRun && (
          <Button
            type="button"
            onClick={handleScheduleClick}
            disabled={!canSchedule || createMutation.isPending}
            className="gap-1.5"
          >
            <CalendarClock className="size-4 stroke-[1.75]" />
            <span>{createMutation.isPending ? "Scheduling..." : "Schedule test"}</span>
          </Button>
        )}

        {isRunActive && activeRun && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => cancelMutation.mutate(activeRun.id)}
            disabled={cancelMutation.isPending}
            className="gap-1.5"
          >
            <XCircle className="size-4 stroke-[1.75]" />
            <span>{cancelMutation.isPending ? "Cancelling..." : "Cancel test"}</span>
          </Button>
        )}

        {activeRun && !isRunActive && (
          <Button
            type="button"
            variant="outline"
            onClick={() => resetMutation.mutate(activeRun.id)}
            disabled={resetMutation.isPending}
            className="gap-1.5"
          >
            <RotateCcw className="size-4 stroke-[1.75]" />
            <span>Reset</span>
          </Button>
        )}
      </div>

      {/* Changelog & Generated Post Preview */}
      {activeRun && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Changelog */}
          <Card className="border border-card-border bg-card">
            <CardHeader className="p-4 pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold">Execution changelog</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {activeRun.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Waiting for first scheduled step...</p>
              ) : (
                <div className="relative pl-5 space-y-4 border-l-2 border-border ml-2">
                  {activeRun.events.map((ev, idx) => {
                    const Icon =
                      ev.status === "completed"
                        ? CheckCircle2
                        : ev.status === "failed"
                          ? CircleX
                          : ev.status === "skipped_dry_run" || ev.status === "skipped_not_approved"
                            ? SkipForward
                            : ev.status === "running"
                              ? LoaderCircle
                              : ev.status === "cancelled"
                                ? XCircle
                                : Clock;
                    const iconColor =
                      ev.status === "completed"
                        ? "text-status-success-fg"
                        : ev.status === "failed"
                          ? "text-status-danger-fg"
                          : ev.status.startsWith("skipped")
                            ? "text-status-warning-fg"
                            : "text-status-info-fg";
                    return (
                      <div key={`${ev.ts}-${idx}`} className="relative flex items-start justify-between gap-3">
                        <span className="absolute -left-[27px] top-0.5 bg-card p-0.5 rounded-full">
                          <Icon className={cn("size-4 stroke-[1.75]", iconColor)} />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-medium text-foreground break-words">
                            {ev.message}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatTimeInTz(ev.ts, tz)}
                            {typeof ev.delay_seconds === "number" ? ` · ${ev.delay_seconds}s delay` : ""}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                          {formatRelativeTime(ev.ts, nowMs)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Post Preview */}
          <Card className="border border-card-border bg-card">
            <CardHeader className="p-4 pb-3 border-b border-border flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm font-semibold">Generated post preview</CardTitle>
              {activeRun.post_preview && (
                <StatusBadge status={activeRun.post_preview.status} />
              )}
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {!activeRun.post_preview ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                  <CircleDashed className="size-4 stroke-[1.75]" />
                  <span>Post preview will appear here once Step 1 completes.</span>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-foreground">
                    {activeRun.post_preview.topic_title}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {activeRun.post_preview.caption}
                  </p>
                  {activeRun.post_preview.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeRun.post_preview.hashtags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          #{tag.replace(/^#/, "")}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {activeRun.post_preview.first_comment && (
                    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">First comment</p>
                      <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                        {activeRun.post_preview.first_comment}
                      </p>
                    </div>
                  )}
                  {activeRun.post_preview.external_url && (
                    <a
                      href={activeRun.post_preview.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-status-info-fg hover:underline"
                    >
                      <span>View on LinkedIn</span>
                      <ExternalLink className="size-3.5 stroke-[1.75]" />
                    </a>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Live Publish Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule live LinkedIn publish test?</AlertDialogTitle>
            <AlertDialogDescription>
              Dry run is OFF. If you approve the post in Slack, Step 3 will publish it to your real LinkedIn account at the scheduled upload time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2.5 py-2">
            <Checkbox
              id="confirm-live-publish"
              checked={confirmChecked}
              onCheckedChange={(v) => setConfirmChecked(Boolean(v))}
            />
            <Label htmlFor="confirm-live-publish" className="text-xs leading-relaxed cursor-pointer">
              I understand this will publish a real post to my LinkedIn account at the upload time if approved.
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confirmChecked || createMutation.isPending}
              onClick={submitSchedule}
            >
              Confirm &amp; schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
