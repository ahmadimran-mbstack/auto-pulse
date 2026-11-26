"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function UsageBar({
  used,
  limit,
  label,
  tooltip,
  compact = false,
  className,
}: {
  used: number;
  limit: number | null | undefined;
  label?: string;
  tooltip?: string;
  compact?: boolean;
  className?: string;
}) {
  const hasLimit = limit !== null && limit !== undefined && limit > 0;
  const rawPct = hasLimit ? Math.round((used / (limit as number)) * 100) : 0;
  const pct = Math.max(0, Math.min(100, rawPct));

  const barColor =
    rawPct > 90
      ? "bg-red-500 dark:bg-red-400"
      : rawPct >= 70
        ? "bg-amber-500 dark:bg-amber-400"
        : "bg-emerald-500 dark:bg-emerald-400";

  const pctColor =
    rawPct > 90
      ? "text-red-700 dark:text-red-300"
      : rawPct >= 70
        ? "text-amber-800 dark:text-amber-300"
        : "text-muted-foreground";

  const content = (
    <div className={cn("space-y-1.5 w-full min-w-[120px]", className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        {label ? (
          <span className="text-muted-foreground truncate">{label}</span>
        ) : (
          <span className="font-medium tabular-nums text-foreground">
            {limit === null || limit === undefined
              ? `${used.toLocaleString()} (unlimited)`
              : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
          </span>
        )}
        <span className={cn("tabular-nums shrink-0 font-medium", pctColor)}>
          {label ? (
            limit === null || limit === undefined ? (
              `${used.toLocaleString()} (unlimited)`
            ) : (
              `${used.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)`
            )
          ) : limit !== null && limit !== undefined ? (
            `${pct}%`
          ) : null}
        </span>
      </div>
      {limit !== null && limit !== undefined && (
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label || "Usage progress"}
          className={cn(
            "w-full overflow-hidden rounded-full bg-secondary",
            compact ? "h-1.5" : "h-2"
          )}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-200", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );

  if (!tooltip) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-full">{content}</div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

const AVATAR_PALETTE = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

function computeInitials(name?: string | null, email?: string | null): string {
  const src = (name || "").trim() || (email || "").split("@")[0] || "U";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function hashUserId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 33 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function UserAvatar({
  userId,
  name,
  email,
  imageUrl,
  size = "sm",
  className,
}: {
  userId: string;
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const tone = AVATAR_PALETTE[hashUserId(userId || email || "u") % AVATAR_PALETTE.length];
  const sizeClass =
    size === "xs"
      ? "size-6 text-[10px]"
      : size === "sm"
        ? "size-8 text-xs"
        : size === "md"
          ? "size-10 text-sm"
          : "size-12 text-base";

  return (
    <Avatar className={cn(sizeClass, "border border-border shrink-0", className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt={name || email || "User avatar"} />}
      <AvatarFallback className={cn("font-medium", tone)}>
        {computeInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}

export function CopyButton({
  value,
  label = "Copy to clipboard",
  toastLabel = "Copied",
  className,
}: {
  value: string;
  label?: string;
  toastLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(toastLabel);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          aria-label={label}
          className={cn("size-7 text-muted-foreground hover:text-foreground", className)}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}

function formatRelativeLabel(date: Date, nowMs: number): string {
  const diffSec = Math.round((date.getTime() - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  const future = diffSec > 0;
  if (abs < 45) return future ? "in a moment" : "just now";
  const mins = Math.round(abs / 60);
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.round(abs / 3600);
  if (hrs < 24) return future ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(abs / 86400);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function RelativeTime({
  iso,
  fallback = "—",
  className,
}: {
  iso: string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  const [nowMs] = React.useState(() => Date.now());
  if (!iso) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return <span className={cn("text-muted-foreground", className)}>{iso}</span>;
  }

  const utcStr = date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={date.toISOString()} className={cn("whitespace-nowrap cursor-default", className)}>
          {formatRelativeLabel(date, nowMs)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{utcStr}</TooltipContent>
    </Tooltip>
  );
}
