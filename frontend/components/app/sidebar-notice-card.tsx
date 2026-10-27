"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardConnection } from "@/types/dashboard";

import { PlatformLabel } from "@/components/app/PlatformLabel";

interface SidebarNoticeCardProps {
  connections?: DashboardConnection[];
}

// Notice card appearing above user row when LinkedIn needs reconnection or renewal
export function SidebarNoticeCard({ connections }: SidebarNoticeCardProps) {
  const linkedin = connections?.find((c) => c.provider === "linkedin");
  const status = linkedin?.status || "not_connected";
  const daysLeft = linkedin?.days_left ?? 0;
  const expiryKey = linkedin?.expires_at || status;

  // Determine whether to display the warning or error notice
  const isMissing = !linkedin || status === "not_connected";
  const isExpired = status === "expired" || (linkedin && daysLeft <= 0);
  const isExpiringSoon = linkedin && daysLeft > 0 && daysLeft <= 7;

  const isDismissedStored = React.useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    () => {
      try {
        return localStorage.getItem(`autopulse_notice_${expiryKey}`) === "true";
      } catch {
        return false;
      }
    },
    () => false
  );
  const [userDismissed, setUserDismissed] = React.useState(false);
  const dismissed = userDismissed || isDismissedStored;

  if (dismissed || (!isMissing && !isExpired && !isExpiringSoon)) {
    return null;
  }

  const handleDismiss = () => {
    setUserDismissed(true);
    try {
      localStorage.setItem(`autopulse_notice_${expiryKey}`, "true");
    } catch {
      // ignore
    }
  };

  let badgeVariant: "danger" | "warning" | "info" = "danger";
  let badgeText = "Disconnected";
  let sentence = "Connect your LinkedIn profile to publish daily updates.";

  if (isExpiringSoon) {
    badgeVariant = "info";
    badgeText = `Expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
    sentence = "Your connection token will expire soon. Reconnect to avoid pauses.";
  } else if (isExpired) {
    badgeVariant = "danger";
    badgeText = "Expired";
    sentence = "Your connection has expired. Reconnect to resume automated posts.";
  }

  return (
    <div data-slot="card" className="relative mx-2 mb-2 rounded-lg border border-card-border bg-card p-3">
      {/* Close button top right */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss notice"
        className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
      >
        <X className="size-3" />
      </button>

      {/* Header with Title and Status Badge */}
      <div className="flex items-center gap-2 pr-6">
        <PlatformLabel platform="linkedin" size="sm" />
        <Badge variant={badgeVariant}>{badgeText}</Badge>
      </div>

      {/* Notice explanation */}
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        {sentence}
      </p>

      {/* Full-width primary action button */}
      <div className="mt-2.5">
        <Button
          asChild
          size="sm"
          className="h-8 w-full rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
        >
          <Link href="/app/connections" className="inline-flex items-center justify-center gap-1.5">
            <span>{isMissing ? "Connect" : "Reconnect"}</span>
            <PlatformLabel platform="linkedin" size="xs" textClassName="text-primary-foreground" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

