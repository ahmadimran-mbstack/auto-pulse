"use client";

import * as React from "react";
import { AlertTriangle, Info, Loader2, ShieldAlert, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  InfoBox,
  type AdminModalSize,
} from "@/components/admin/modal-parts";

type DialogTone = "default" | "info" | "warning" | "danger";

const MAX_WIDTH_TO_SIZE: Record<string, AdminModalSize> = {
  "sm:max-w-md": "sm",
  "sm:max-w-lg": "md",
  "sm:max-w-2xl": "lg",
  "sm:max-w-3xl": "xl",
};

export function StandardDialog({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  tone = "default",
  maxWidth = "sm:max-w-md",
  size,
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
  size?: AdminModalSize;
  contentClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const DisplayIcon =
    Icon || (tone === "danger" ? ShieldAlert : tone === "warning" ? AlertTriangle : Info);
  const resolvedSize = size ?? MAX_WIDTH_TO_SIZE[maxWidth] ?? "md";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminModalContent
        size={resolvedSize}
        className={contentClassName}
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
        <AdminModalHeader
          title={title}
          description={description}
          icon={DisplayIcon}
          tone={tone}
        />

        <AdminModalBody className={bodyClassName}>{children}</AdminModalBody>

        {footer && (
          <AdminModalFooter className={footerClassName}>{footer}</AdminModalFooter>
        )}
      </AdminModalContent>
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
    <InfoBox tone={tone} title={title}>
      {children}
    </InfoBox>
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
