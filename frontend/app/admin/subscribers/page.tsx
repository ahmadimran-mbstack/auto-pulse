"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Clock,
  CreditCard,
  DollarSign,
  Layers,
  Users as UsersIcon,
} from "lucide-react";

import { AdminExportButton } from "@/components/admin/export-button";
import {
  DataTableShell,
  DaysLeftChip,
  EmptyState,
  ErrorState,
  PageHeader,
  PaginationFooter,
  PlanBadge,
  RelativeTime,
  StatCard,
  StatCardSkeleton,
  StatusBadge,
  TableSkeleton,
  Toolbar,
  UsageBar,
  UserAvatar,
} from "@/components/admin/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAdminPlansOverview, getAdminSubscribers } from "@/lib/api";
import type { AdminSubscriberItem } from "@/types/admin";
import { ChangePlanModal, SetEndDateModal } from "../users/UserActionModals";

export default function AdminSubscribersPage() {
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [intervalFilter, setIntervalFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState<"period_end" | "usage">("period_end");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);

  const [planTarget, setPlanTarget] = React.useState<AdminSubscriberItem | null>(null);
  const [endDateTarget, setEndDateTarget] = React.useState<AdminSubscriberItem | null>(null);
  const [emailErrorBanner, setEmailErrorBanner] = React.useState<{
    userId: string;
    message: string;
  } | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: getAdminPlansOverview,
    staleTime: 60_000,
  });
  const allPlans = plansQuery.data?.plans || [];

  const query = useQuery({
    queryKey: [
      "admin-subscribers",
      debouncedSearch,
      planFilter,
      intervalFilter,
      statusFilter,
      sortBy,
      sortOrder,
      page,
    ],
    queryFn: () =>
      getAdminSubscribers({
        search: debouncedSearch || undefined,
        plan: planFilter,
        interval: intervalFilter,
        effective_status: statusFilter,
        sort: sortBy,
        order: sortOrder,
        page,
      }),
    staleTime: 0,
  });

  const summary = query.data?.summary;
  const items = query.data?.items || [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data?.total_pages || 1;

  const activeFilters =
    (debouncedSearch ? 1 : 0) +
    (planFilter !== "all" ? 1 : 0) +
    (intervalFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0);

  const clearAll = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setPlanFilter("all");
    setIntervalFilter("all");
    setStatusFilter("all");
    setSortBy("period_end");
    setSortOrder("asc");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscribers"
        description="Active subscriptions, MRR estimate, renewals due soon, and manual plan adjustments."
        actions={
          <AdminExportButton
            kind="subscribers"
            params={{
              search: debouncedSearch || undefined,
              plan: planFilter,
              interval: intervalFilter,
              effective_status: statusFilter,
              sort: sortBy,
              order: sortOrder,
            }}
          />
        }
      />

      {emailErrorBanner && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{emailErrorBanner.message}</span>
            <Link href={`/admin/users/${emailErrorBanner.userId}`} className="underline font-medium">
              Open user detail to resend
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        {query.isLoading && !summary ? (
          [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Paid subscribers"
              value={summary ? summary.paid_subscribers : "—"}
              icon={UsersIcon}
              tone="violet"
            />
            <StatCard
              label="Estimated MRR"
              value={summary ? `$${summary.estimated_mrr_usd.toFixed(2)}` : "—"}
              icon={DollarSign}
              tone="emerald"
            />
            <StatCard
              label="Expiring in 7 days"
              value={summary ? summary.expiring_7d : "—"}
              icon={Clock}
              tone="amber"
            />
            <StatCard
              label="Overdue"
              value={summary ? summary.overdue : "—"}
              icon={AlertTriangle}
              tone="rose"
            />
          </>
        )}
      </div>

      {query.isError ? (
        <ErrorState
          title="Could not load subscribers"
          message="Failed to fetch subscriber records."
          onRetry={() => query.refetch()}
        />
      ) : (
        <DataTableShell
          title="Subscribers"
          description={`${total} matching subscriber${total === 1 ? "" : "s"}`}
          toolbar={
            <Toolbar
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              searchPlaceholder="Search name or email..."
              activeFilterCount={activeFilters}
              onClearAll={clearAll}
              filters={
                <>
                  <Select
                    value={planFilter}
                    onValueChange={(v) => {
                      setPlanFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue placeholder="Plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All plans</SelectItem>
                      {allPlans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={intervalFilter}
                    onValueChange={(v) => {
                      setIntervalFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-36 h-9">
                      <SelectValue placeholder="Interval" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All intervals</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={statusFilter}
                    onValueChange={(v) => {
                      setStatusFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="Effective status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All effective states</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="canceled">Canceled</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={`${sortBy}:${sortOrder}`}
                    onValueChange={(v) => {
                      const [s, o] = v.split(":") as ["period_end" | "usage", "asc" | "desc"];
                      setSortBy(s);
                      setSortOrder(o);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="period_end:asc">Ending soonest</SelectItem>
                      <SelectItem value="period_end:desc">Ending latest</SelectItem>
                      <SelectItem value="usage:desc">Highest usage</SelectItem>
                      <SelectItem value="usage:asc">Lowest usage</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              }
            />
          }
          pagination={
            !query.isLoading && items.length > 0 ? (
              <PaginationFooter
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={12}
                onPageChange={setPage}
              />
            ) : undefined
          }
        >
          {query.isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Monthly rate</TableHead>
                  <TableHead>Period end</TableHead>
                  <TableHead>Quota used</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableSkeleton columns={7} rows={6} />
            </Table>
          ) : items.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No subscribers match your filters"
              description="Try clearing filters to see all subscriptions."
              action={
                activeFilters > 0 ? (
                  <Button size="sm" variant="outline" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Monthly rate</TableHead>
                  <TableHead>Period end</TableHead>
                  <TableHead className="min-w-[160px]">Quota used</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-[190px]">
                        <UserAvatar userId={sub.id} name={sub.name} email={sub.email} size="sm" />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/users/${sub.id}`}
                            className="font-medium text-sm hover:underline block truncate max-w-[160px]"
                          >
                            {sub.name}
                          </Link>
                          <div className="text-xs text-muted-foreground truncate max-w-[190px]">
                            {sub.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PlanBadge planId={sub.plan_id} planName={sub.plan_name} />
                        {sub.billing_interval && (
                          <Badge variant="outline" className="capitalize text-[11px]">
                            {sub.billing_interval}
                          </Badge>
                        )}
                        {sub.has_pending_payment && (
                          <StatusBadge
                            kind="payment"
                            value="pending"
                            labelOverride="Pending payment"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-right tabular-nums whitespace-nowrap font-medium">
                      ${sub.monthly_rate_usd.toFixed(2)}/mo
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          <RelativeTime iso={sub.current_period_end} />
                        </span>
                        {sub.is_overdue ? (
                          <StatusBadge kind="subscription" value="overdue" />
                        ) : (
                          <DaysLeftChip
                            daysLeft={sub.days_left}
                            endDateIso={sub.current_period_end}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <UsageBar
                        used={sub.scheduled_used}
                        limit={sub.scheduled_limit}
                        compact
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="account" value={sub.account_status} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => setPlanTarget(sub)}>
                          <Layers className="size-3.5 mr-1.5" />
                          Change plan
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Set end date for ${sub.email}`}
                              onClick={() => setEndDateTarget(sub)}
                            >
                              <Calendar className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Set subscription end date</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataTableShell>
      )}

      {planTarget && (
        <ChangePlanModal
          open={Boolean(planTarget)}
          onOpenChange={(o) => !o && setPlanTarget(null)}
          userId={planTarget.id}
          userEmail={planTarget.email}
          currentPlanId={planTarget.plan_id}
          currentInterval={planTarget.billing_interval}
          isAdminUser={planTarget.is_admin}
          onCompleted={(res) => {
            if (res.email_status === "failed") {
              setEmailErrorBanner({
                userId: res.userId,
                message: `Plan changed to ${res.plan_name}, but email failed: ${res.email_error || "SMTP error"}.`,
              });
            } else {
              setEmailErrorBanner(null);
            }
          }}
        />
      )}

      {endDateTarget && (
        <SetEndDateModal
          open={Boolean(endDateTarget)}
          onOpenChange={(o) => !o && setEndDateTarget(null)}
          userId={endDateTarget.id}
          userEmail={endDateTarget.email}
          currentEndIso={endDateTarget.current_period_end}
        />
      )}
    </div>
  );
}
