"use client";

import * as React from "react";
import { ImageIcon, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/admin/shared";
import { fetchAuthenticatedObjectUrl } from "@/lib/api";
import type { SupportCategory, SupportPriority, SupportStatus } from "@/types/support";

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  bug: "Bug report",
  billing: "Billing",
  linkedin_account: "LinkedIn account",
  posts: "Posts & scheduling",
  feature_request: "Feature request",
  other: "Other",
};

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return <StatusBadge kind="ticket" value={status} />;
}

export function SupportPriorityBadge({ priority }: { priority: SupportPriority }) {
  return <StatusBadge kind="priority" value={priority} />;
}

export function formatSupportDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AuthenticatedSupportImage({ path }: { path: string }) {
  const [result, setResult] = React.useState<{
    path: string;
    src: string | null;
    failed: boolean;
  } | null>(null);

  React.useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    fetchAuthenticatedObjectUrl(path)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setResult({ path, src: url, failed: false });
      })
      .catch(() => {
        if (active) setResult({ path, src: null, failed: true });
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [path]);

  const current = result?.path === path ? result : null;

  if (current?.failed) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
        <ImageIcon className="size-3.5" />
        Could not load screenshot attachment
      </div>
    );
  }

  if (!current?.src) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading screenshot...
      </div>
    );
  }

  return (
    <a
      href={current.src}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-block overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.src}
        alt="Ticket attachment"
        className="max-h-72 max-w-full object-contain"
      />
    </a>
  );
}
