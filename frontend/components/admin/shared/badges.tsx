"use client";

import * as React from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusBadgeKind =
  | "account"
  | "payment"
  | "subscription"
  | "ticket"
  | "priority"
  | "email"
  | "connection"
  | "run"
  | "visibility";

export type StatusTone =
  | "success"
  | "pending"
  | "info"
  | "progress"
  | "warning"
  | "danger"
  | "neutral";

const TONE_CLASSES: Record<StatusTone, { pill: string; dot: string; pulse?: boolean }> = {
  success: {
    pill: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
  },
  pending: {
    pill: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300 dark:ring-amber-400/25",
    dot: "bg-amber-500",
    pulse: true,
  },
  info: {
    pill: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300 dark:ring-sky-400/25",
    dot: "bg-sky-500",
  },
  progress: {
    pill: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300 dark:ring-violet-400/25",
    dot: "bg-violet-500",
  },
  warning: {
    pill: "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300 dark:ring-orange-400/25",
    dot: "bg-orange-500",
  },
  danger: {
    pill: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-300 dark:ring-red-400/25",
    dot: "bg-red-500",
  },
  neutral: {
    pill: "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300 dark:ring-slate-400/25",
    dot: "bg-slate-500 dark:bg-slate-400",
  },
};

const CENTRAL_STATUS_MAP: Record<string, { tone: StatusTone; label?: string }> = {
  // Success
  active: { tone: "success", label: "Active" },
  approved: { tone: "success", label: "Approved" },
  sent: { tone: "success", label: "Sent" },
  resolved: { tone: "success", label: "Resolved" },
  connected: { tone: "success", label: "Connected" },
  paid: { tone: "success", label: "Paid" },
  published: { tone: "success", label: "Published" },
  public: { tone: "success", label: "Public" },

  // Pending (slow pulse)
  pending: { tone: "pending", label: "Pending" },
  under_review: { tone: "pending", label: "Under review" },
  "under review": { tone: "pending", label: "Under review" },
  queued: { tone: "pending", label: "Queued" },
  sending: { tone: "pending", label: "Sending" },
  unknown: { tone: "warning", label: "Unknown" },

  // Info
  open: { tone: "info", label: "Open" },
  trialing: { tone: "info", label: "Trialing" },
  trial: { tone: "info", label: "Trial" },
  manual: { tone: "info", label: "Manual" },
  running: { tone: "info", label: "Running" },

  // In progress
  in_progress: { tone: "progress", label: "In progress" },
  "in progress": { tone: "progress", label: "In progress" },

  // Warning
  suspended: { tone: "warning", label: "Suspended" },
  high: { tone: "warning", label: "High" },
  high_priority: { tone: "warning", label: "High priority" },
  "high priority": { tone: "warning", label: "High priority" },
  expiring_soon: { tone: "warning", label: "Expiring soon" },
  "expiring soon": { tone: "warning", label: "Expiring soon" },
  needs_reconnect: { tone: "warning", label: "Needs reconnect" },
  "needs reconnect": { tone: "warning", label: "Needs reconnect" },
  hidden: { tone: "warning", label: "Hidden" },
  private: { tone: "warning", label: "Private" },

  // Danger
  rejected: { tone: "danger", label: "Rejected" },
  failed: { tone: "danger", label: "Failed" },
  disabled: { tone: "danger", label: "Disabled" },
  expired: { tone: "danger", label: "Expired" },
  overdue: { tone: "danger", label: "Overdue" },
  urgent: { tone: "danger", label: "Urgent" },
  disconnected: { tone: "danger", label: "Disconnected" },
  not_connected: { tone: "danger", label: "Not connected" },
  error: { tone: "danger", label: "Error" },
  archived: { tone: "danger", label: "Archived" },

  // Neutral
  not_linked: { tone: "neutral", label: "Not linked" },
  voided: { tone: "neutral", label: "Voided" },
  canceled: { tone: "neutral", label: "Canceled" },
  cancelled: { tone: "neutral", label: "Canceled" },
  skipped: { tone: "neutral", label: "Skipped" },
  low: { tone: "neutral", label: "Low" },
  low_priority: { tone: "neutral", label: "Low priority" },
  "low priority": { tone: "neutral", label: "Low priority" },
  internal: { tone: "neutral", label: "Internal" },
  medium: { tone: "neutral", label: "Medium" },
  medium_priority: { tone: "neutral", label: "Medium priority" },
  "medium priority": { tone: "neutral", label: "Medium priority" },
};

export function StatusBadge({
  kind,
  value,
  labelOverride,
  className,
}: {
  kind: StatusBadgeKind;
  value: string | null | undefined;
  labelOverride?: string;
  className?: string;
}) {
  const raw = (value || "").trim();
  const normalized = raw.toLowerCase();
  const mapped = CENTRAL_STATUS_MAP[normalized];
  const tone: StatusTone = mapped?.tone ?? "neutral";
  const styles = TONE_CLASSES[tone];
  const text =
    labelOverride ||
    mapped?.label ||
    (raw ? raw.replace(/_/g, " ") : "Unknown");

  return (
    <span
      data-status-kind={kind}
      data-status-value={normalized || "unknown"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        styles.pill,
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full shrink-0",
          styles.dot,
          styles.pulse && "motion-safe:animate-pulse"
        )}
      />
      <span>{text}</span>
    </span>
  );
}

const FIXED_PLAN_STYLES: Record<string, string> = {
  trial: "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300 dark:ring-slate-400/25",
  starter: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300 dark:ring-sky-400/25",
  pro: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300 dark:ring-violet-400/25",
  business: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300 dark:ring-amber-400/25",
  internal:
    "bg-slate-500/5 text-slate-700 border border-dashed border-slate-500/40 ring-0 dark:text-slate-300 dark:border-slate-400/40",
};

const CUSTOM_PLAN_PALETTE = [
  "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300 dark:ring-emerald-400/25",
  "bg-teal-500/10 text-teal-700 ring-teal-500/25 dark:text-teal-300 dark:ring-teal-400/25",
  "bg-indigo-500/10 text-indigo-700 ring-indigo-500/25 dark:text-indigo-300 dark:ring-indigo-400/25",
  "bg-cyan-500/10 text-cyan-700 ring-cyan-500/25 dark:text-cyan-300 dark:ring-cyan-400/25",
  "bg-fuchsia-500/10 text-fuchsia-700 ring-fuchsia-500/25 dark:text-fuchsia-300 dark:ring-fuchsia-400/25",
  "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300 dark:ring-rose-400/25",
];

function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getPlanAccentColor(planId: string): string {
  const id = (planId || "").toLowerCase();
  if (id === "trial") return "border-t-slate-400";
  if (id === "starter") return "border-t-sky-500";
  if (id === "pro") return "border-t-violet-500";
  if (id === "business") return "border-t-amber-500";
  if (id === "internal") return "border-t-slate-400";
  const idx = hashSlug(id) % 6;
  return [
    "border-t-emerald-500",
    "border-t-teal-500",
    "border-t-indigo-500",
    "border-t-cyan-500",
    "border-t-fuchsia-500",
    "border-t-rose-500",
  ][idx];
}

export function PlanBadge({
  planId,
  planName,
  className,
}: {
  planId: string;
  planName?: string | null;
  className?: string;
}) {
  const slug = (planId || "").trim().toLowerCase();
  const fixed = FIXED_PLAN_STYLES[slug];
  const colorClass = fixed || CUSTOM_PLAN_PALETTE[hashSlug(slug) % CUSTOM_PLAN_PALETTE.length];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        colorClass,
        className
      )}
    >
      {planName || planId}
    </span>
  );
}

const METHOD_META: Record<string, { label: string; dot: string }> = {
  easypaisa: { label: "Easypaisa", dot: "bg-emerald-500" },
  jazzcash: { label: "JazzCash", dot: "bg-orange-500" },
  manual: { label: "Manual", dot: "bg-slate-500 dark:bg-slate-400" },
  cash: { label: "Cash", dot: "bg-slate-500 dark:bg-slate-400" },
  bank_transfer: { label: "Bank transfer", dot: "bg-slate-500 dark:bg-slate-400" },
};

export function MethodBadge({
  method,
  className,
}: {
  method: string | null | undefined;
  className?: string;
}) {
  const key = (method || "").trim().toLowerCase();
  const meta = METHOD_META[key] || {
    label: (method || "Other").replace(/_/g, " "),
    dot: "bg-slate-500 dark:bg-slate-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground whitespace-nowrap",
        className
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full shrink-0", meta.dot)} />
      <span>{meta.label}</span>
    </span>
  );
}

export function RoleBadge({
  label = "Admin",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-500/25 dark:text-violet-300 dark:ring-violet-400/25 whitespace-nowrap",
        className
      )}
    >
      <Shield className="size-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function YouBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-500/25 dark:text-sky-300 dark:ring-sky-400/25",
        className
      )}
    >
      You
    </span>
  );
}

export function DaysLeftChip({
  daysLeft,
  endDateIso,
  isOverdue,
  className,
}: {
  daysLeft?: number | null;
  endDateIso?: string | null;
  isOverdue?: boolean;
  className?: string;
}) {
  const [nowMs] = React.useState(() => Date.now());
  let computedDays = daysLeft;
  if (computedDays === undefined && endDateIso) {
    const ms = new Date(endDateIso).getTime() - nowMs;
    if (!Number.isNaN(ms)) {
      computedDays = ms >= 0 ? Math.ceil(ms / 86_400_000) : Math.floor(ms / 86_400_000);
    }
  }
  if (computedDays === null || computedDays === undefined) {
    if (!isOverdue) return null;
    computedDays = -1;
  }

  let label: string;
  let color: string;
  if (isOverdue || computedDays < 0) {
    const ago = Math.max(1, Math.abs(computedDays));
    label = `Ended ${ago}d ago`;
    color = "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-300 dark:ring-red-400/25";
  } else if (computedDays === 0) {
    label = "Ends today";
    color = "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300 dark:ring-orange-400/25";
  } else if (computedDays <= 7) {
    label = `${computedDays}d left`;
    color = "bg-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300 dark:ring-orange-400/25";
  } else {
    label = `${computedDays}d left`;
    color = "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300 dark:ring-emerald-400/25";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums whitespace-nowrap",
        color,
        className
      )}
    >
      {label}
    </span>
  );
}
