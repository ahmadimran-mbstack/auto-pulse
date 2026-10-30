"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ListFilter, LayoutGrid, List } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DashboardConnection } from "@/types/dashboard";

export type DateFilterRange = "7d" | "30d" | "all";
export type ViewMode = "grid" | "list";

interface OverviewToolsRowProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  dateRange: DateFilterRange;
  onDateRangeChange: (range: DateFilterRange) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  connections?: DashboardConnection[];
}

export function OverviewToolsRow({
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  viewMode,
  onViewModeChange,
  connections,
}: OverviewToolsRowProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [filterOpen, setFilterOpen] = React.useState(false);

  // Global key listener for '/' shortcut to focus search input
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (!isInput && e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Check LinkedIn connection status
  const linkedin = connections?.find((c) => c.provider === "linkedin");
  const isConnected = linkedin && linkedin.status !== "not_connected" && linkedin.status !== "expired";
  const accountName = linkedin?.account_name || "";

  const dateOptions: { value: DateFilterRange; label: string }[] = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "all", label: "All time" },
  ];

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full min-w-0">
      {/* Search Input: fills width */}
      <div
        data-input-wrapper
        className="relative flex-1 min-w-0 h-9 rounded-lg border border-card-border bg-card px-3 flex items-center gap-2 transition-[border-color] duration-200 ease-in-out focus-within:border-input-focus"
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search posts"
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 shadow-none focus:shadow-none"
        />
        <kbd
          aria-hidden="true"
          className="hidden sm:inline-flex size-5 items-center justify-center rounded border border-border bg-secondary text-xs font-mono text-muted-foreground shrink-0"
        >
          /
        </kbd>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Date Range Filter Button & Popover */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Filter posts by date range"
                  className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                >
                  <ListFilter className="size-4" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Filter by date</TooltipContent>
          </Tooltip>

          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-44 rounded-lg border border-border bg-card p-1"
          >
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Date range
            </div>
            {dateOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onDateRangeChange(opt.value);
                  setFilterOpen(false);
                }}
                className={cn(
                  "w-full text-left rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  dateRange === opt.value
                    ? "bg-secondary font-medium text-foreground"
                    : "text-foreground hover:bg-accent"
                )}
              >
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Segmented View Mode Toggle: Grid and List */}
        <div
          role="radiogroup"
          aria-label="Posts view layout"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-card p-0.5 gap-0.5"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "grid"}
                aria-label="Grid view"
                onClick={() => onViewModeChange("grid")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors duration-200 ease-in-out",
                  viewMode === "grid"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Grid view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "list"}
                aria-label="List view"
                onClick={() => onViewModeChange("list")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors duration-200 ease-in-out",
                  viewMode === "list"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">List view</TooltipContent>
          </Tooltip>
        </div>

        {/* LinkedIn Connection Status Pill */}
        <Link
          href="/app/connections"
          className="flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm transition-colors hover:bg-accent shrink-0 max-w-[200px] sm:max-w-none truncate"
        >
          {/* LinkedIn Glyph */}
          <svg
            viewBox="0 0 24 24"
            className="size-3.5 fill-status-info-fg shrink-0"
            aria-hidden="true"
          >
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
          </svg>

          {isConnected ? (
            <div className="flex items-center gap-1.5 text-xs truncate">
              <span className="font-medium text-foreground truncate">LinkedIn connected</span>
              {accountName && (
                <span className="text-muted-foreground truncate max-w-24">
                  {accountName}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs font-medium text-foreground truncate">
              Connect LinkedIn
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
