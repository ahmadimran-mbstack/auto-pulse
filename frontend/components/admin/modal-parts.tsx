"use client";

import * as React from "react";
import { Plus, X, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type AdminModalSize = "sm" | "md" | "lg" | "xl";
export type AdminModalTone = "default" | "info" | "warning" | "danger";

const SIZE_CLASSES: Record<AdminModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
};

const ICON_TONE_CLASSES: Record<AdminModalTone, string> = {
  default: "bg-secondary text-foreground",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
};

const INFO_BOX_CLASSES: Record<"info" | "warning" | "danger", string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  danger: "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200",
};

export function AdminModalContent({
  size = "md",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogContent> & {
  size?: AdminModalSize;
}) {
  return (
    <DialogContent
      className={cn(
        "flex max-h-[90vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0 gap-0",
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

export function AdminModalHeader({
  title,
  description,
  icon: Icon,
  tone = "default",
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: AdminModalTone;
  className?: string;
}) {
  return (
    <DialogHeader className={cn("shrink-0 border-b border-border px-6 pt-6 pb-5 pr-10", className)}>
      <div className="flex items-start gap-4">
        {Icon && (
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg mt-0.5",
              ICON_TONE_CLASSES[tone]
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0 text-left">
          <DialogTitle className="text-base font-semibold leading-snug">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </div>
      </div>
    </DialogHeader>
  );
}

export const AdminModalBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function AdminModalBody({ className, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 text-sm",
        "[&_input]:h-10 [&_input]:text-sm [&_textarea]:min-h-[96px] [&_textarea]:w-full [&_textarea]:resize-none",
        "**:data-[slot=select-trigger]:h-10 **:data-[slot=select-trigger]:w-full",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export function AdminModalField({
  label,
  htmlFor,
  required,
  helper,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2 min-w-0", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

export function InputWithAffix({
  prefix,
  suffix,
  className,
  inputClassName,
  ...props
}: React.ComponentProps<typeof Input> & {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  inputClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 w-full items-center rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        props.disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {prefix && (
        <span className="shrink-0 pl-3 pr-1.5 text-xs font-medium text-muted-foreground select-none">
          {prefix}
        </span>
      )}
      <Input
        {...props}
        className={cn(
          "h-full flex-1 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
          prefix && "pl-0",
          suffix && "pr-0",
          inputClassName
        )}
      />
      {suffix && (
        <span className="shrink-0 pr-3 pl-1.5 text-xs font-medium text-muted-foreground select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function InfoBox({
  tone = "info",
  title,
  className,
  children,
}: {
  tone?: "info" | "warning" | "danger";
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-4 text-xs",
        INFO_BOX_CLASSES[tone],
        className
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className="leading-relaxed opacity-95">{children}</div>
    </div>
  );
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  children,
}: {
  id?: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 cursor-pointer",
        className
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-medium leading-snug text-foreground">{label}</span>
        {description && (
          <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
        )}
        {children}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="shrink-0"
      />
    </label>
  );
}

export function FieldGrid({
  cols = 2,
  className,
  children,
}: {
  cols?: 2 | 3;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AdminModalSection({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-4 min-w-0", className)}>
      <div className="border-b border-border pb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

export function RepeatList({
  items,
  onChange,
  placeholder = "Enter item",
  addLabel = "Add item",
  disabled,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  disabled?: boolean;
}) {
  const rows = items.length > 0 ? items : [""];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {rows.map((val, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={val}
              disabled={disabled}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...rows];
                next[idx] = e.target.value;
                onChange(next);
              }}
              className="flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled || (rows.length === 1 && val === "")}
              aria-label="Remove item"
              onClick={() => {
                const next = rows.filter((_, i) => i !== idx);
                onChange(next.length > 0 ? next : [""]);
              }}
              className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...rows, ""])}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          <span>{addLabel}</span>
        </Button>
      </div>
    </div>
  );
}

export function AdminModalFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-muted/40 px-6 py-4",
        className
      )}
    >
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end *:w-full sm:*:w-auto">
        {children}
      </div>
    </div>
  );
}
