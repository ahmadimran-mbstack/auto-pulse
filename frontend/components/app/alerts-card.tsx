"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/types/dashboard";

interface AlertsCardProps {
  data?: DashboardData;
}

export function AlertsCard({ data }: AlertsCardProps) {
  // Derive active alerts based on LinkedIn connection and post states
  const linkedin = data?.connections?.find((c) => c.provider === "linkedin");
  const alerts: {
    id: string;
    message: string;
    action: string;
    href: string;
    icon: typeof AlertCircle;
    iconColor: string;
  }[] = [];

  // LinkedIn not connected
  if (!linkedin || linkedin.status === "not_connected") {
    alerts.push({
      id: "li_not_connected",
      message: "LinkedIn is not connected.",
      action: "Connect",
      href: "/app/connections",
      icon: AlertCircle,
      iconColor: "text-status-danger-fg",
    });
  } else if (linkedin.status === "expired" || (linkedin.days_left ?? 0) <= 0) {
    alerts.push({
      id: "li_expired",
      message: "LinkedIn connection has expired.",
      action: "Reconnect",
      href: "/app/connections",
      icon: AlertCircle,
      iconColor: "text-status-danger-fg",
    });
  } else if ((linkedin.days_left ?? 0) <= 7) {
    alerts.push({
      id: "li_expiring",
      message: `LinkedIn token expires in ${linkedin.days_left} days.`,
      action: "Reconnect",
      href: "/app/connections",
      icon: AlertTriangle,
      iconColor: "text-status-warning-fg",
    });
  }

  // Post awaiting approval
  if (data?.stats?.awaiting_approval && data.stats.awaiting_approval > 0) {
    alerts.push({
      id: "awaiting_approval",
      message: `${data.stats.awaiting_approval} post waiting for your approval.`,
      action: "Review",
      href: "/app?status=needs_approval",
      icon: Clock,
      iconColor: "text-status-warning-fg",
    });
  }

  // Failed posts
  if (data?.stats?.failed_30d && data.stats.failed_30d > 0) {
    alerts.push({
      id: "post_failed",
      message: `${data.stats.failed_30d} post failed to publish to LinkedIn.`,
      action: "Open",
      href: "/app?status=problems",
      icon: AlertCircle,
      iconColor: "text-status-danger-fg",
    });
  }

  return (
    <div data-slot="card" className="w-full min-w-0 overflow-hidden rounded-lg border border-card-border bg-card p-4">
      {alerts.length === 0 ? (
        // Empty state: centered in card with 32px bordered square bell icon
        <div className="py-8 px-4 flex flex-col items-center justify-center text-center">
          <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground mb-3">
            <Bell className="size-4" />
          </div>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            No alerts. We will show problems with your posts or LinkedIn connection here.
          </p>
        </div>
      ) : (
        // List of alert rows
        <div className="space-y-1">
          {alerts.map((alert, idx) => {
            const Icon = alert.icon;
            const isZebra = idx % 2 === 1;
            return (
              <div
                key={alert.id}
                className={cn(
                  "flex h-8 items-center justify-between rounded-lg px-2 text-sm transition-colors",
                  isZebra ? "bg-stripe" : "bg-card"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <Icon className={cn("size-4 shrink-0", alert.iconColor)} strokeWidth={1.5} />
                  <span className="text-sm font-normal text-foreground truncate">
                    {alert.message}
                  </span>
                </div>
                <Link
                  href={alert.href}
                  className="text-sm font-medium text-foreground underline hover:text-muted-foreground shrink-0"
                >
                  {alert.action}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
