"use client";

import * as React from "react";
import { AlertTriangle, Info, Loader2, ShieldAlert, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DialogTone = "default" | "info" | "warning" | "danger";

const ICON_TONE_CLASSES: Record<DialogTone, string> = {
  default: "bg-secondary text-foreground",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const CALLOUT_CLASSES: Record<"warning" | "danger" | "info", string> = {
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  danger:
    "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200",
  info:
    "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
};

export function StandardDialog({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  tone = "default",
  maxWidth = "sm:max-w-md",
  contentClassName,
  bodyClassName,
  footerClassName,
  initialFocusRef,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: DialogTone;
  maxWidth?: string;
  contentClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const DisplayIcon =
    Icon || (tone === "danger" ? ShieldAlert : tone === "warning" ? AlertTriangle : Info);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden p-0",
          maxWidth,
          contentClassName
        )}
        onOpenAutoFocus={(event) => {
          if (!initialFocusRef?.current) return;
          event.preventDefault();
          requestAnimationFrame(() => {
            const target = initialFocusRef.current;
            if (!target) return;
            target.focus({ preventScroll: true });
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
              const end = target.value.length;
              try {
                target.setSelectionRange(end, end);
              } catch {
                // Some input types do not support text selection ranges.
              }
            }
          });
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg mt-0.5",
                ICON_TONE_CLASSES[tone]
              )}
            >
              <DisplayIcon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1 min-w-0 text-left">
              <DialogTitle className="text-base font-semibold leading-snug">{title}</DialogTitle>
              {description && (
                <DialogDescription className="text-xs leading-relaxed">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm [&_input]:h-10 [&_input]:w-full [&_input]:text-sm [&_textarea]:w-full [&_textarea]:resize-none [&_label]:text-sm [&_label]:font-medium [&_label]:whitespace-nowrap **:data-[slot=select-trigger]:h-10 **:data-[slot=select-trigger]:w-full",
            bodyClassName
          )}
        >
          {children}
        </div>

        {footer && (
          <div
            className={cn(
              "shrink-0 border-t border-border bg-muted/20 px-6 py-4",
              footerClassName
            )}
          >
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end *:w-full sm:*:w-auto">
              {footer}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DialogCallout({
  tone = "warning",
  title = "What will happen",
  children,
}: {
  tone?: "warning" | "danger" | "info";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border px-3.5 py-2.5 text-xs space-y-1", CALLOUT_CLASSES[tone])}>
      <p className="font-semibold">{title}</p>
      <div className="leading-relaxed opacity-95">{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  summary,
  summaryTone = "warning",
  maxWidth = "sm:max-w-md",
  initialFocusRef,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  isPending = false,
  disabled = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  summary?: React.ReactNode;
  summaryTone?: "warning" | "danger" | "info";
  maxWidth?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <StandardDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={icon}
      tone={destructive ? "danger" : summaryTone === "warning" ? "warning" : "info"}
      maxWidth={maxWidth}
      initialFocusRef={initialFocusRef}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={isPending || disabled}
            onClick={onConfirm}
          >
            {isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      {summary && (
        <DialogCallout tone={summaryTone}>{summary}</DialogCallout>
      )}
      {children}
    </StandardDialog>
  );
}
