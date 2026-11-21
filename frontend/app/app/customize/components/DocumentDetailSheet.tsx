"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  CirclePause,
  ClipboardPaste,
  Copy,
  ExternalLink,
  EyeOff,
  FileText,
  FlaskConical,
  Link2,
  Pause,
  Pin,
  Play,
  Quote,
  RefreshCw,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/app/StatusBadge";
import { StageProgress } from "@/components/app/ProgressBars";
import {
  customizationKeys,
  formatCustomizationError,
  getCustomizationDocument,
  PROCESSING_STATUSES,
} from "@/lib/customization";
import { cn } from "@/lib/utils";
import type { DocumentSummary, FactView, PostSampleView } from "@/types/customization";
import { CategoryBadge, DocumentKindBadge, ScopeBadge, getCategorySpec } from "./categoryBadges";

interface DocumentDetailSheetProps {
  docId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleEnabled?: (doc: DocumentSummary, enabled: boolean) => void;
  onReprocess?: (doc: DocumentSummary) => void;
  onToggleFactCore?: (factId: string, isCore: boolean) => void;
  onToggleFactRemoved?: (factId: string, removed: boolean) => void;
  onToggleSamplePin?: (sampleId: string, pinned: boolean) => void;
  onToggleSampleExclude?: (sampleId: string, excluded: boolean) => void;
  onAddBusinessDocument?: () => void;
  onReturnFocus?: () => void;
}

function formatAddedDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard."),
      () => toast.error("Could not copy to clipboard.")
    );
  }
}

function FactCard({
  fact,
  docTitle,
  isPlaybook,
  onToggleCore,
  onSoftRemove,
}: {
  fact: FactView;
  docTitle: string;
  isPlaybook: boolean;
  onToggleCore?: (factId: string, isCore: boolean) => void;
  onSoftRemove?: (fact: FactView) => void;
}) {
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const hasEvidence = Boolean(fact.evidence_quote?.trim() || fact.source_label?.trim());

  return (
    <div className="rounded-lg border border-card-border bg-card p-4 space-y-2.5 transition-colors hover:border-border-hover min-w-0">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <CategoryBadge category={fact.category} />

          {isPlaybook ? (
            <>
              <ScopeBadge scope={fact.applies_to} />
              <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={fact.source_label || docTitle}>
                {fact.source_label || docTitle}
              </span>
            </>
          ) : (
            fact.is_core && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning-border bg-status-warning-bg px-2.5 py-0.5 text-xs font-medium text-status-warning-fg whitespace-nowrap cursor-help">
                    <Star className="size-4 shrink-0 stroke-[1.75] fill-current" aria-hidden="true" />
                    <span>Core</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Always included in every post&apos;s business context, even when not matched by topic search.
                </TooltipContent>
              </Tooltip>
            )
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!isPlaybook && onToggleCore && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={fact.is_core ? "Unmark core fact" : "Mark as core fact"}
                  onClick={() => onToggleCore(fact.id, !fact.is_core)}
                  className={cn(
                    "size-7",
                    fact.is_core ? "text-status-warning-fg" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Star
                    className={cn("size-4 stroke-[1.75]", fact.is_core && "fill-current")}
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {fact.is_core
                  ? "Unmark core (currently always included in every post)"
                  : "Mark as core (always include in every post)"}
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Copy item text"
                onClick={() => copyText(fact.text)}
                className="size-7 text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-4 stroke-[1.75]" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Copy</TooltipContent>
          </Tooltip>

          {onSoftRemove && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove item"
                  onClick={() => onSoftRemove(fact)}
                  className="size-7 text-muted-foreground hover:text-status-danger-fg"
                >
                  <Trash2 className="size-4 stroke-[1.75]" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Remove</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground break-words">{fact.text}</p>

      {fact.numbers && fact.numbers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {fact.numbers.map((num, idx) => (
            <span
              key={`${fact.id}-num-${idx}`}
              className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-xs text-foreground tabular-nums"
            >
              {num}
            </span>
          ))}
        </div>
      )}

      {hasEvidence && (
        <div className="pt-1 border-t border-border/60">
          <button
            type="button"
            onClick={() => setEvidenceOpen((prev) => !prev)}
            aria-expanded={evidenceOpen}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Quote className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
            <span>Evidence</span>
            {evidenceOpen ? (
              <ChevronDown className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
            )}
          </button>
          {evidenceOpen && (
            <div className="mt-2 rounded-md border border-border bg-muted/40 p-2.5 space-y-1 text-xs text-muted-foreground">
              {fact.evidence_quote && (
                <p className="italic text-foreground/90 break-words">
                  &ldquo;{fact.evidence_quote}&rdquo;
                </p>
              )}
              {fact.source_label && (
                <p className="text-muted-foreground">Source: {fact.source_label}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SampleCard({
  sample,
  onTogglePin,
  onToggleExclude,
}: {
  sample: PostSampleView;
  onTogglePin?: (sampleId: string, pinned: boolean) => void;
  onToggleExclude?: (sampleId: string, excluded: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-card-border bg-card p-4 space-y-2.5 transition-colors hover:border-border-hover min-w-0",
        sample.excluded && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            #{sample.ordinal + 1} · {sample.char_count.toLocaleString()} chars
          </span>
          {sample.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-warning-border bg-status-warning-bg px-2.5 py-0.5 text-xs font-medium text-status-warning-fg whitespace-nowrap">
              <Pin className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
              <span>Pinned</span>
            </span>
          )}
          {sample.quality_flag && (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-danger-border bg-status-danger-bg px-2.5 py-0.5 text-xs font-medium text-status-danger-fg whitespace-nowrap">
              <TriangleAlert className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
              <span>Low quality</span>
            </span>
          )}
          {sample.excluded && (
            <Badge variant="outline" className="text-xs">
              Excluded
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onTogglePin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={sample.pinned ? "Unpin post sample" : "Pin post sample"}
                  onClick={() => onTogglePin(sample.id, !sample.pinned)}
                  className={cn(
                    "size-7",
                    sample.pinned ? "text-status-warning-fg" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Pin className="size-4 stroke-[1.75]" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{sample.pinned ? "Unpin" : "Pin"}</TooltipContent>
            </Tooltip>
          )}
          {onToggleExclude && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={sample.excluded ? "Include post sample" : "Exclude post sample"}
                  onClick={() => onToggleExclude(sample.id, !sample.excluded)}
                  className={cn(
                    "size-7",
                    sample.excluded ? "text-status-danger-fg" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <EyeOff className="size-4 stroke-[1.75]" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{sample.excluded ? "Include" : "Exclude"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Copy post text"
                onClick={() => copyText(sample.text)}
                className="size-7 text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-4 stroke-[1.75]" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Copy</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
        {sample.text}
      </p>
    </div>
  );
}

export function DocumentDetailSheet({
  docId,
  open,
  onOpenChange,
  onToggleEnabled,
  onReprocess,
  onToggleFactCore,
  onToggleFactRemoved,
  onToggleSamplePin,
  onToggleSampleExclude,
  onAddBusinessDocument,
  onReturnFocus,
}: DocumentDetailSheetProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [showErrorDetails, setShowErrorDetails] = React.useState(false);
  const [prevDocId, setPrevDocId] = React.useState<string | null>(docId);

  if (docId !== prevDocId) {
    setPrevDocId(docId);
    setSelectedCategory("all");
    setShowErrorDetails(false);
  }

  const { data, isLoading } = useQuery({
    queryKey: customizationKeys.document(docId ?? ""),
    queryFn: () => getCustomizationDocument(docId!),
    enabled: Boolean(open && docId),
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st && PROCESSING_STATUSES.has(st) ? 2000 : false;
    },
  });

  const SourceIcon =
    data?.source_type === "url"
      ? Link2
      : data?.source_type === "paste"
        ? ClipboardPaste
        : FileText;

  const isProcessing = Boolean(data && PROCESSING_STATUSES.has(data.status));
  const isPaused = Boolean(data && (data.status === "disabled" || !data.enabled));
  const isFailed = Boolean(data && data.status === "failed");
  const isPlaybook = data?.kind === "playbook";
  const isPreviousPosts = data?.kind === "previous_posts";

  const activeFacts = React.useMemo(
    () => (data?.facts ?? []).filter((f) => !f.removed),
    [data?.facts]
  );

  const categoryCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of activeFacts) {
      const key = (f.category || "other").trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [activeFacts]);

  const showFilterChips = activeFacts.length > 5 && categoryCounts.length > 1;

  const visibleFacts = React.useMemo(() => {
    if (selectedCategory === "all") return activeFacts;
    return activeFacts.filter(
      (f) => (f.category || "other").trim().toLowerCase() === selectedCategory
    );
  }, [activeFacts, selectedCategory]);

  const coreCount = activeFacts.filter((f) => f.is_core).length;
  const withNumbersCount = activeFacts.filter((f) => (f.numbers?.length ?? 0) > 0).length;
  const pinnedSamplesCount = (data?.samples ?? []).filter((s) => s.pinned).length;
  const excludedSamplesCount = (data?.samples ?? []).filter((s) => s.excluded).length;

  const showZeroNumbersCallout =
    Boolean(data) &&
    data?.kind === "business" &&
    !isProcessing &&
    !isFailed &&
    activeFacts.length > 0 &&
    withNumbersCount === 0;

  const friendlyError =
    isFailed && data
      ? data.friendly_error || formatCustomizationError(data.error_code, data.error_detail)
      : null;

  const handleSoftRemoveFact = (fact: FactView) => {
    if (!onToggleFactRemoved) return;
    onToggleFactRemoved(fact.id, true);
    toast.success("Item removed.", {
      action: {
        label: "Undo",
        onClick: () => onToggleFactRemoved(fact.id, false),
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-[520px] p-0 gap-0 flex flex-col overflow-hidden"
        onCloseAutoFocus={(e) => {
          if (onReturnFocus) {
            e.preventDefault();
            onReturnFocus();
          }
        }}
      >
        {/* Sticky Header */}
        <SheetHeader className="shrink-0 border-b border-border px-4 sm:px-6 py-4 space-y-2.5 text-left">
          {isLoading || !data ? (
            <div className="space-y-2 pr-8">
              <SheetTitle className="sr-only">Loading document details</SheetTitle>
              <SheetDescription className="sr-only">Loading learned items</SheetDescription>
              <Skeleton className="h-5 w-48" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2.5 pr-8 min-w-0">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <SourceIcon className="size-4 stroke-[1.75]" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <SheetTitle className="text-base font-semibold leading-snug text-foreground break-words">
                    {data.title}
                  </SheetTitle>
                  {data.source_type === "url" && data.source_url && (
                    <a
                      href={data.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline break-all"
                    >
                      <span className="truncate">{data.source_url}</span>
                      <ExternalLink className="size-3.5 shrink-0 stroke-[1.75]" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>

              <SheetDescription className="sr-only">
                Learned items and details for {data.title}
              </SheetDescription>

              <div className="flex flex-wrap items-center gap-1.5">
                <DocumentKindBadge kind={data.kind} />
                <StatusBadge
                  status={data.status}
                  label={data.friendly_status || undefined}
                />
                {data.char_count ? (
                  <Badge variant="outline" className="tabular-nums">
                    {data.char_count.toLocaleString()} chars
                  </Badge>
                ) : null}
                {data.created_at ? (
                  <span className="text-xs text-muted-foreground tabular-nums px-1">
                    Added {formatAddedDate(data.created_at)}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </SheetHeader>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {isLoading || !data ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {/* Paused Callout */}
              {isPaused && (
                <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <CirclePause
                      className="size-4 shrink-0 stroke-[1.75] text-status-warning-fg mt-0.5"
                      aria-hidden="true"
                    />
                    <p className="text-xs leading-relaxed text-status-warning-fg">
                      This source is paused. Its facts are not used in your posts.
                    </p>
                  </div>
                  {onToggleEnabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onToggleEnabled(data, true)}
                      className="shrink-0 h-8 text-xs"
                    >
                      Resume source
                    </Button>
                  )}
                </div>
              )}

              {/* Processing state */}
              {isProcessing && (
                <div className="rounded-lg border border-status-info-border bg-status-info-bg p-4 space-y-3">
                  <p className="text-sm font-medium text-status-info-fg">
                    {data.friendly_status || "Processing document..."}
                  </p>
                  <StageProgress
                    stageIndex={data.stage_index ?? 1}
                    stageTotal={data.stage_total ?? 4}
                  />
                  <p className="text-xs text-status-info-fg/90">
                    AutoPulse is reading this source and extracting items. This panel updates automatically.
                  </p>
                </div>
              )}

              {/* Failed state */}
              {isFailed && friendlyError && (
                <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-status-danger-fg leading-relaxed">
                      {friendlyError}
                    </p>
                    {onReprocess && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onReprocess(data)}
                        className="shrink-0 h-8 gap-1.5 text-xs"
                      >
                        <RefreshCw className="size-4 stroke-[1.75]" aria-hidden="true" />
                        <span>Retry</span>
                      </Button>
                    )}
                  </div>
                  {data.error_detail && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowErrorDetails((prev) => !prev)}
                        aria-expanded={showErrorDetails}
                        className="inline-flex items-center gap-1 text-xs font-medium text-status-danger-fg/90 hover:text-status-danger-fg cursor-pointer"
                      >
                        {showErrorDetails ? (
                          <ChevronDown className="size-4 stroke-[1.75]" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="size-4 stroke-[1.75]" aria-hidden="true" />
                        )}
                        <span>Details</span>
                      </button>
                      {showErrorDetails && (
                        <pre className="mt-2 rounded-md border border-status-danger-border bg-background/60 p-2.5 text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                          {data.error_detail}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Summary Strip */}
              {!isProcessing && !isFailed && (activeFacts.length > 0 || data.samples.length > 0) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-card-border bg-card px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                  {activeFacts.length > 0 && (
                    <>
                      <span>
                        <strong className="font-semibold text-foreground">{activeFacts.length}</strong>{" "}
                        {isPlaybook
                          ? activeFacts.length === 1
                            ? "rule"
                            : "rules"
                          : activeFacts.length === 1
                            ? "fact"
                            : "facts"}{" "}
                        extracted
                      </span>
                      {!isPlaybook && (
                        <>
                          <span>
                            <strong className="font-semibold text-foreground">{coreCount}</strong> core
                          </span>
                          <span>
                            <strong className="font-semibold text-foreground">{withNumbersCount}</strong>{" "}
                            with numbers
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {isPreviousPosts && data.samples.length > 0 && (
                    <>
                      <span>
                        <strong className="font-semibold text-foreground">{data.samples.length}</strong>{" "}
                        {data.samples.length === 1 ? "post" : "posts"}
                      </span>
                      <span>
                        <strong className="font-semibold text-foreground">{pinnedSamplesCount}</strong>{" "}
                        pinned
                      </span>
                      <span>
                        <strong className="font-semibold text-foreground">{excludedSamplesCount}</strong>{" "}
                        excluded
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Zero numbers warning callout */}
              {showZeroNumbersCallout && (
                <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <TriangleAlert
                      className="size-4 shrink-0 stroke-[1.75] text-status-warning-fg mt-0.5"
                      aria-hidden="true"
                    />
                    <p className="text-xs leading-relaxed text-status-warning-fg">
                      None of these facts include numbers. Posts need real numbers to sound specific. Add a case study or a page with results.
                    </p>
                  </div>
                  {onAddBusinessDocument && (
                    <div className="pl-6">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onAddBusinessDocument}
                        className="h-8 text-xs"
                      >
                        Add business document
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Category Filter Chips */}
              {showFilterChips && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter items by category">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer tabular-nums",
                      selectedCategory === "all"
                        ? "border-foreground bg-foreground text-background"
                        : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-border-hover"
                    )}
                  >
                    <span>All ({activeFacts.length})</span>
                  </button>
                  {categoryCounts.map(([catKey, count]) => {
                    const spec = getCategorySpec(catKey);
                    const isSelected = selectedCategory === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setSelectedCategory(catKey)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer tabular-nums",
                          isSelected
                            ? "border-foreground bg-foreground text-background"
                            : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-border-hover"
                        )}
                      >
                        <span>
                          {spec.label} ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Facts / Playbook rules list */}
              {visibleFacts.length > 0 && (
                <div className="space-y-3">
                  {visibleFacts.map((fact) => (
                    <FactCard
                      key={fact.id}
                      fact={fact}
                      docTitle={data.title}
                      isPlaybook={Boolean(isPlaybook || fact.kind === "playbook_rule")}
                      onToggleCore={onToggleFactCore}
                      onSoftRemove={onToggleFactRemoved ? handleSoftRemoveFact : undefined}
                    />
                  ))}
                </div>
              )}

              {/* Previous posts samples list */}
              {data.samples.length > 0 && (
                <div className="space-y-3">
                  {data.samples.map((sample) => (
                    <SampleCard
                      key={sample.id}
                      sample={sample}
                      onTogglePin={onToggleSamplePin}
                      onToggleExclude={onToggleSampleExclude}
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!isProcessing &&
                !isFailed &&
                activeFacts.length === 0 &&
                data.samples.length === 0 && (
                  <div className="rounded-lg border border-dashed border-card-border bg-card p-6 text-center space-y-3">
                    <p className="text-sm font-medium text-foreground">
                      No learned items extracted
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
                      {isPreviousPosts
                        ? "No individual posts were detected in this source. Try separating posts with --- on its own line, then re-extract."
                        : "AutoPulse did not find concrete facts or rules in this source (or all items were removed). Try re-extracting or adding a more detailed page."}
                    </p>
                    {onReprocess && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onReprocess(data)}
                        className="gap-1.5"
                      >
                        <RefreshCw className="size-4 stroke-[1.75]" aria-hidden="true" />
                        <span>Re-extract</span>
                      </Button>
                    )}
                  </div>
                )}
            </>
          )}
        </div>

        {/* Sticky Footer */}
        <SheetFooter className="shrink-0 border-t border-border bg-popover px-4 sm:px-6 py-3.5 flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {data && onReprocess && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isProcessing}
                onClick={() => onReprocess(data)}
                className="gap-1.5"
              >
                <RefreshCw className="size-4 stroke-[1.75]" aria-hidden="true" />
                <span>Re-extract</span>
              </Button>
            )}
            {data && onToggleEnabled && data.status !== "failed" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isProcessing}
                onClick={() => onToggleEnabled(data, !data.enabled)}
                className="gap-1.5"
              >
                {data.enabled ? (
                  <>
                    <Pause className="size-4 stroke-[1.75]" aria-hidden="true" />
                    <span>Pause source</span>
                  </>
                ) : (
                  <>
                    <Play className="size-4 stroke-[1.75]" aria-hidden="true" />
                    <span>Resume source</span>
                  </>
                )}
              </Button>
            )}
          </div>

          <Button asChild size="sm" className="gap-1.5 ml-auto">
            <Link href="/app/playground">
              <FlaskConical className="size-4 stroke-[1.75]" aria-hidden="true" />
              <span>Test in Playground</span>
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
