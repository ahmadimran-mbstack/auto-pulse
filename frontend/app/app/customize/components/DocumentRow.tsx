"use client";

import * as React from "react";
import {
  FileTextIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Trash2Icon,
  EyeIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/app/StatusBadge";
import { formatCustomizationError } from "@/lib/customization";
import type { DocumentSummary } from "@/types/customization";

interface DocumentRowProps {
  doc: DocumentSummary;
  onToggleEnabled: (doc: DocumentSummary, enabled: boolean) => void;
  onInspect: (doc: DocumentSummary) => void;
  onReprocess: (doc: DocumentSummary) => void;
  onDelete: (doc: DocumentSummary) => void;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentRow({
  doc,
  onToggleEnabled,
  onInspect,
  onReprocess,
  onDelete,
}: DocumentRowProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const Icon = doc.source_type === "url" ? GlobeIcon : FileTextIcon;
  const errMsg = doc.status === "failed" ? formatCustomizationError(doc.error_code, doc.error_detail) : null;
  const processingStages: Record<string, { pct: number; label: string }> = {
    uploaded: { pct: 25, label: "Queued for reading..." },
    extracting: { pct: 45, label: "Reading document text..." },
    distilling: { pct: 70, label: "Learning structured insights..." },
    embedding: { pct: 90, label: "Indexing for retrieval..." },
  };
  const activeStage = processingStages[doc.status];

  return (
    <>
      <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onInspect(doc)}
                className="truncate text-left text-sm font-medium text-foreground hover:text-primary"
              >
                {doc.title}
              </button>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                <span>{doc.source_type.toUpperCase()}</span>
                {doc.size_bytes ? <span>· {formatBytes(doc.size_bytes)}</span> : null}
                {doc.token_estimate ? <span>· ~{doc.token_estimate.toLocaleString()} tokens</span> : null}
                {doc.source_url ? (
                  <span className="truncate max-w-[240px]">· {doc.source_url}</span>
                ) : null}
              </div>
              {errMsg && (
                <p className="mt-1 text-xs text-status-danger-fg">{errMsg}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {errMsg ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <StatusBadge status={doc.status} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {errMsg}
                </TooltipContent>
              </Tooltip>
            ) : (
              <StatusBadge status={doc.status} />
            )}

            {doc.status === "failed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReprocess(doc)}
              >
                <RefreshCwIcon className="size-3.5 mr-1.5" />
                Retry
              </Button>
            )}

            <Switch
              aria-label={`Enable ${doc.title}`}
              checked={doc.enabled}
              onCheckedChange={(checked) => onToggleEnabled(doc, checked)}
              disabled={doc.status === "failed"}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${doc.title}`}>
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onInspect(doc)}>
                  <EyeIcon className="size-4 mr-2" />
                  Inspect learned items
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onReprocess(doc)}>
                  <RefreshCwIcon className="size-4 mr-2" />
                  Reprocess
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2Icon className="size-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {activeStage && (
          <div className="space-y-1 pl-12">
            <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
              <span>{activeStage.label}</span>
              <span>{activeStage.pct}%</span>
            </div>
            <Progress value={activeStage.pct} />
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
