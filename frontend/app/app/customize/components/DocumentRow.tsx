"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Eye,
  FileText,
  Globe,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/app/StatusBadge";
import { StageProgress } from "@/components/app/ProgressBars";
import { formatCustomizationError } from "@/lib/customization";
import type { DocumentSummary } from "@/types/customization";

interface DocumentRowProps {
  doc: DocumentSummary;
  onToggleEnabled: (doc: DocumentSummary, enabled: boolean) => void;
  onInspect: (doc: DocumentSummary) => void;
  onReprocess: (doc: DocumentSummary) => void;
  onDelete: (doc: DocumentSummary) => void;
}

const PROCESSING_STATUSES = new Set(["uploaded", "extracting", "distilling", "embedding"]);

function formatAddedTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DocumentRow({
  doc,
  onToggleEnabled,
  onInspect,
  onReprocess,
  onDelete,
}: DocumentRowProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [showErrorDetails, setShowErrorDetails] = React.useState(false);

  const Icon =
    doc.source_type === "url"
      ? Globe
      : doc.source_type === "paste"
        ? ClipboardPaste
        : FileText;

  const isProcessing = PROCESSING_STATUSES.has(doc.status);
  const friendlyError =
    doc.status === "failed"
      ? doc.friendly_error || formatCustomizationError(doc.error_code, doc.error_detail)
      : null;

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex min-w-0 items-start sm:items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4 stroke-[1.75]" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <button
                type="button"
                onClick={() => onInspect(doc)}
                className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline cursor-pointer"
                title={doc.title}
              >
                {doc.title}
              </button>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                {doc.char_count ? (
                  <span>{doc.char_count.toLocaleString()} chars</span>
                ) : null}
                {doc.created_at ? (
                  <span>
                    {doc.char_count ? "· " : ""}Added {formatAddedTime(doc.created_at)}
                  </span>
                ) : null}
                {doc.source_url ? (
                  <span className="truncate max-w-[220px]">· {doc.source_url}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
            <StatusBadge
              status={doc.status}
              label={doc.friendly_status || undefined}
            />

            {doc.status === "failed" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onReprocess(doc)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <RefreshCw className="size-4 stroke-[1.75]" />
                    <span>Retry</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Retry processing</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Inspect ${doc.title}`}
                  onClick={() => onInspect(doc)}
                  className="size-8"
                >
                  <Eye className="size-4 stroke-[1.75]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Inspect learned items</TooltipContent>
            </Tooltip>

            {doc.status !== "failed" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Reprocess ${doc.title}`}
                    onClick={() => onReprocess(doc)}
                    className="size-8"
                  >
                    <RefreshCw className="size-4 stroke-[1.75]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reprocess</TooltipContent>
              </Tooltip>
            )}

            <Switch
              aria-label={`Enable ${doc.title}`}
              checked={doc.enabled}
              onCheckedChange={(checked) => onToggleEnabled(doc, checked)}
              disabled={doc.status === "failed"}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${doc.title}`}
                  onClick={() => setConfirmOpen(true)}
                  className="size-8 text-muted-foreground hover:text-status-danger-fg"
                >
                  <Trash2 className="size-4 stroke-[1.75]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {isProcessing && (
          <StageProgress
            stageIndex={doc.stage_index ?? 1}
            stageTotal={doc.stage_total ?? 4}
            className="pl-12"
          />
        )}

        {friendlyError && (
          <div className="pl-12 space-y-1.5">
            <p className="text-xs text-status-danger-fg">{friendlyError}</p>
            {doc.error_detail && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowErrorDetails((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showErrorDetails ? (
                    <ChevronDown className="size-3.5 stroke-[1.75]" />
                  ) : (
                    <ChevronRight className="size-3.5 stroke-[1.75]" />
                  )}
                  <span>Details</span>
                </button>
                {showErrorDetails && (
                  <pre className="mt-1.5 rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
                    {doc.error_detail}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {doc.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the document and everything AutoPulse learned from it. Your customization profile will recompile automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete(doc)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
