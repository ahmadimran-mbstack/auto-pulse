"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, Bell, Settings, LogOut, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAction } from "@/app/app/actions";
import { clearAllAppCaches, useDashboardQuery } from "@/lib/queries";
import { getDeterministicGradient } from "@/lib/avatar-gradient";
import { cn } from "@/lib/utils";

interface SidebarUserRowProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
}

export function SidebarUserRow({ user }: SidebarUserRowProps) {
  const displayName = user.name || user.email.split("@")[0] || "User";
  const avatarGradient = getDeterministicGradient(user.id);

  // Retrieve dashboard data to compute active alerts
  const { data: dashboardData } = useDashboardQuery(user.id);

  // Derive client alerts
  const linkedin = dashboardData?.connections?.find((c) => c.provider === "linkedin");
  const alerts: { id: string; message: string; action: string; href: string; isDanger: boolean }[] = [];

  if (!linkedin || linkedin.status === "not_connected") {
    alerts.push({
      id: "li_missing",
      message: "LinkedIn is not connected.",
      action: "Connect",
      href: "/app/connections",
      isDanger: true,
    });
  } else if (linkedin.status === "expired" || (linkedin.days_left ?? 0) <= 0) {
    alerts.push({
      id: "li_expired",
      message: "LinkedIn connection expired.",
      action: "Reconnect",
      href: "/app/connections",
      isDanger: true,
    });
  } else if ((linkedin.days_left ?? 0) <= 7) {
    alerts.push({
      id: "li_expiring",
      message: `LinkedIn token expires in ${linkedin.days_left} days.`,
      action: "Reconnect",
      href: "/app/connections",
      isDanger: false,
    });
  }

  if (dashboardData?.stats?.awaiting_approval && dashboardData.stats.awaiting_approval > 0) {
    alerts.push({
      id: "post_approval",
      message: `${dashboardData.stats.awaiting_approval} post waiting for review.`,
      action: "Review",
      href: "/app?status=needs_approval",
      isDanger: false,
    });
  }

  if (dashboardData?.stats?.failed_30d && dashboardData.stats.failed_30d > 0) {
    alerts.push({
      id: "post_failed",
      message: `${dashboardData.stats.failed_30d} post failed to publish.`,
      action: "Open",
      href: "/app?status=problems",
      isDanger: true,
    });
  }

  const hasAlerts = alerts.length > 0;

  return (
    <div className="flex h-14 items-center justify-between px-3 border-t border-border bg-sidebar">
      {/* User profile identifier */}
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        <div
          style={{ background: avatarGradient }}
          className="size-5 shrink-0 rounded-full border border-border"
          aria-hidden="true"
        />
        <span className="text-sm font-normal text-foreground truncate max-w-32">
          {displayName}
        </span>
      </div>

      {/* Action icon buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Account Menu trigger */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User account menu"
                  className="flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Account settings</TooltipContent>
          </Tooltip>

          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            className="w-64 p-2 space-y-1"
          >
            <DropdownMenuLabel className="px-3 py-2 font-normal">
              <div className="text-xs text-muted-foreground truncate">
                {user.email}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app/settings" className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                <Settings className="size-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form
                action={signOutAction}
                onSubmit={() => {
                  clearAllAppCaches();
                }}
                className="w-full"
              >
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-destructive cursor-pointer"
                >
                  <LogOut className="size-4" />
                  <span>Sign out</span>
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Alerts popover trigger */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="View notifications and alerts"
                  className="relative flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                >
                  <Bell className="size-3.5" />
                  {hasAlerts && (
                    <span className="absolute top-1 right-1 size-1.5 rounded-full bg-status-danger-fg" />
                  )}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Notifications</TooltipContent>
          </Tooltip>

          <PopoverContent
            side="top"
            align="end"
            sideOffset={8}
            className="w-84 sm:w-96 p-4"
          >
            <div className="text-sm font-semibold text-foreground mb-3">
              Notifications & Alerts
            </div>
            {alerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No alerts. You are all caught up.
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between gap-3 rounded-lg p-2.5 text-xs bg-secondary/50 border border-border"
                  >
                    <span className="text-foreground truncate">{alert.message}</span>
                    <Link
                      href={alert.href}
                      className={cn(
                        "shrink-0 font-medium underline flex items-center gap-1",
                        alert.isDanger ? "text-status-danger-fg" : "text-status-info-fg"
                      )}
                    >
                      {alert.action}
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
