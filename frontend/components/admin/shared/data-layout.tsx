"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Inbox,
  RotateCcw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  badge,
  meta,
  actions,
  className,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
        {meta && <div className="pt-0.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

const STAT_TONES = {
  default: "bg-secondary text-foreground",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  amber: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  rose: "bg-red-500/10 text-red-700 dark:text-red-300",
};

export function StatCard({
  label,
  value,
  subline,
  icon: Icon,
  tone = "default",
  delta,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  subline?: React.ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof STAT_TONES;
  delta?: { value: string; positive: boolean };
  href?: string;
  className?: string;
}) {
  const inner = (
    <Card
      className={cn(
        "h-full flex flex-col rounded-lg border-border bg-card shadow-xs transition-colors duration-150",
        href && "hover:border-border-hover cursor-pointer",
        className
      )}
    >
      <CardContent className="p-5 flex-1 flex flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
            <div className="flex items-baseline gap-2 min-w-0 flex-nowrap">
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground leading-none">
                {value}
              </span>
              {delta && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums shrink-0 leading-none",
                    delta.positive
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-500/10 text-red-700 dark:text-red-300"
                  )}
                >
                  {delta.positive ? (
                    <ArrowUpRight className="size-3" />
                  ) : (
                    <ArrowDownRight className="size-3" />
                  )}
                  {delta.value}
                </span>
              )}
            </div>
          </div>
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              STAT_TONES[tone]
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </div>
        </div>
        {subline && (
          <div className="mt-auto text-xs text-muted-foreground leading-snug truncate">
            {subline}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("rounded-lg border-border bg-card", className)}>
      <CardContent className="p-5 flex items-start justify-between gap-3">
        <div className="space-y-2.5 flex-1">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="size-9 rounded-lg shrink-0" />
      </CardContent>
    </Card>
  );
}

export function Toolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  activeFilterCount = 0,
  onClearAll,
  className,
}: {
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  activeFilterCount?: number;
  onClearAll?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5 flex-1">
        {onSearchChange !== undefined && (
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 pr-8 h-9 rounded-md"
            />
            {Boolean(searchValue) && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
        {filters}
      </div>

      {activeFilterCount > 0 && onClearAll && (
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs font-normal tabular-nums">
            {activeFilterCount} active
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

export function PaginationFooter({
  page,
  totalPages,
  total,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [12, 20, 50],
  className,
}: {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const safeTotal = total ?? 0;
  const start = safeTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(safeTotal, page * pageSize);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 sm:px-5 py-3 text-xs text-muted-foreground",
        className
      )}
    >
      <div className="tabular-nums">
        {total !== undefined
          ? `Showing ${start.toLocaleString()} to ${end.toLocaleString()} of ${safeTotal.toLocaleString()}`
          : `Page ${page} of ${Math.max(1, totalPages)}`}
      </div>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span>Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[68px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <span className="px-1.5 tabular-nums">
            {page} / {Math.max(1, totalPages)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DataTableShell({
  title,
  description,
  headerActions,
  toolbar,
  pagination,
  children,
  className,
}: {
  title?: string;
  description?: string;
  headerActions?: React.ReactNode;
  toolbar?: React.ReactNode;
  pagination?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-lg border-border bg-card shadow-xs p-0 overflow-hidden", className)}>
      {(title || description || headerActions || toolbar) && (
        <div className="border-b border-border px-4 py-4 sm:px-5 space-y-3">
          {(title || description || headerActions) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                {title && <CardTitle className="text-base font-semibold">{title}</CardTitle>}
                {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
              </div>
              {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
            </div>
          )}
          {toolbar}
        </div>
      )}

      {/* Shared table rhythm: header 40px muted tint, body rows 56px with outer edge alignment matching card padding */}
      <div className="w-full overflow-x-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card [&_thead_tr]:h-10 [&_thead_tr]:border-b [&_thead_tr]:border-border [&_thead_tr]:bg-muted/40 [&_thead_tr:hover]:bg-muted/40 [&_thead_th]:px-4 [&_thead_th]:py-2.5 [&_thead_th]:text-[13px] [&_thead_th]:font-medium [&_thead_th]:text-muted-foreground [&_thead_th]:align-middle [&_thead_th:first-child]:pl-4 [&_thead_th:first-child]:sm:pl-5 [&_thead_th:last-child]:pr-4 [&_thead_th:last-child]:sm:pr-5 [&_tbody_tr]:h-14 [&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr:last-child]:border-b-0 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/40 [&_tbody_td]:px-4 [&_tbody_td]:py-3 [&_tbody_td]:align-middle [&_tbody_td:first-child]:pl-4 [&_tbody_td:first-child]:sm:pl-5 [&_tbody_td:last-child]:pr-4 [&_tbody_td:last-child]:sm:pr-5">
        {children}
      </div>

      {pagination}
    </Card>
  );
}

export function TableSkeleton({
  columns,
  rows = 6,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <TableRow key={rIdx} className="h-14">
          {Array.from({ length: columns }).map((__, cIdx) => (
            <TableCell key={cIdx}>
              <Skeleton
                className={cn(
                  "h-4",
                  cIdx === 0 ? "w-36" : cIdx === columns - 1 ? "w-16 ml-auto" : "w-20"
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-red-500/10 text-red-700 dark:text-red-300 mb-3">
        <AlertCircle className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-4">
          <RotateCcw className="size-3.5 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function ChartEmptyState({ message = "No data for this period yet." }: { message?: string }) {
  return (
    <div className="flex h-64 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-center px-4">
      <p className="text-xs font-medium text-muted-foreground">{message}</p>
    </div>
  );
}

export const CardHeaderBar = CardHeader;
