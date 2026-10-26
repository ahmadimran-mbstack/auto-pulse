"use client";

import * as React from "react";
import Link from "next/link";
import { Info, ChevronDown } from "lucide-react";
import { ProgressRing } from "@/components/app/progress-ring";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DashboardStats, DashboardConnection } from "@/types/dashboard";

interface Last30DaysCardProps {
  stats?: DashboardStats;
  connections?: DashboardConnection[];
}

export function Last30DaysCard({ stats, connections }: Last30DaysCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  const linkedin = connections?.find((c) => c.provider === "linkedin");
  const daysLeft = linkedin?.days_left ?? 0;

  // Build metrics rows based strictly on returned backend numbers
  const rows: {
    id: string;
    label: string;
    info: string;
    valueStr: string;
    value: number;
    total: number;
  }[] = [];

  if (stats) {
    // 1. Published posts in the last 30 days
    rows.push({
      id: "published",
      label: "Published",
      info: "Posts published to LinkedIn in the last 30 days.",
      valueStr: `${stats.published_30d}`,
      value: stats.published_30d,
      total: Math.max(stats.published_30d, 30),
    });

    // 2. Awaiting approval drafts
    rows.push({
      id: "awaiting_approval",
      label: "Awaiting approval",
      info: "Drafts ready for your review and approval.",
      valueStr: `${stats.awaiting_approval}`,
      value: stats.awaiting_approval,
      total: Math.max(stats.awaiting_approval, 10),
    });

    // 3. Needs attention (failed posts)
    rows.push({
      id: "failed",
      label: "Needs attention",
      info: "Posts that failed to publish and require attention.",
      valueStr: `${stats.failed_30d}`,
      value: stats.failed_30d,
      total: Math.max(stats.failed_30d, 5),
    });
  }

  // 6. LinkedIn connection row
  rows.push({
    id: "linkedin",
    label: "LinkedIn connection",
    info: "Days left on current LinkedIn authentication session.",
    valueStr: `${daysLeft} / 60 days`,
    value: Math.max(0, daysLeft),
    total: 60,
  });

  return (
    <div data-slot="card" className="relative rounded-lg border border-card-border bg-card pb-4">
      {/* Header row: 56px high */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-border">
        <h3 className="font-sans text-base font-semibold tracking-tight text-foreground">
          Last 30 days
        </h3>
        <Link
          href="/app/posts"
          className="flex h-6 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors duration-150 ease-in-out"
        >
          View posts
        </Link>
      </div>

      {/* Primary rows (always visible) */}
      <div className="mt-2 space-y-1">
        {rows.slice(0, 3).map((row, idx) => {
          const isZebra = idx % 2 === 1;
          return (
            <div
              key={row.id}
              className={cn(
                "mx-2 flex h-8 items-center justify-between rounded-lg px-2 transition-colors duration-200 ease-in-out",
                isZebra ? "bg-stripe" : "bg-card"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ProgressRing value={row.value} total={row.total} size={16} />
                <span className="text-sm font-normal text-foreground truncate">
                  {row.label}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Info for ${row.label}`}
                      className="text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out"
                    >
                      <Info className="size-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{row.info}</TooltipContent>
                </Tooltip>
              </div>

              <div className="text-sm tabular-nums text-muted-foreground shrink-0 pl-2">
                {row.valueStr}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expandable additional rows with smooth ease-in-out animation */}
      {rows.length > 3 && (
        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out overflow-hidden",
            expanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="min-h-0 space-y-1">
            {rows.slice(3).map((row, idx) => {
              const isZebra = (idx + 3) % 2 === 1;
              return (
                <div
                  key={row.id}
                  className={cn(
                    "mx-2 flex h-8 items-center justify-between rounded-lg px-2 transition-colors duration-200 ease-in-out",
                    isZebra ? "bg-stripe" : "bg-card"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ProgressRing value={row.value} total={row.total} size={16} />
                    <span className="text-sm font-normal text-foreground truncate">
                      {row.label}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Info for ${row.label}`}
                          className="text-muted-foreground hover:text-foreground transition-colors duration-200 ease-in-out"
                        >
                          <Info className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{row.info}</TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="text-sm tabular-nums text-muted-foreground shrink-0 pl-2">
                    {row.valueStr}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expansion chevron button overlapping bottom border */}
      {rows.length > 3 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse metrics card" : "Expand metrics card"}
          onClick={() => setExpanded((prev) => !prev)}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200 ease-in-out"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-300 ease-in-out",
              expanded && "rotate-180"
            )}
          />
        </button>
      )}
    </div>
  );
}
