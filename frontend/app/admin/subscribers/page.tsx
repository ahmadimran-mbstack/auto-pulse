"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Layers, Loader2, Search } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { getAdminSubscribers } from "@/lib/api";
import type { AdminSubscriberItem } from "@/types/admin";
import {
  AccountStatusPill,
  ChangePlanModal,
  SetEndDateModal,
} from "../users/UserActionModals";

function formatShortDate(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscribers</h1>
        <p className="text-sm text-muted-foreground">
          Active subscriptions, MRR estimate, renewals due soon, and manual plan adjustments.
        </p>
      </div>

      {emailErrorBanner && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{emailErrorBanner.message}</span>
            <Link href={`/admin/users/${emailErrorBanner.userId}`} className="underline font-medium">
              Open user detail to resend
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Paid subscribers</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary ? summary.paid_subscribers : "-"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Estimated MRR</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary ? `$${summary.estimated_mrr_usd.toFixed(2)}` : "-"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Expiring in 7 days</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary ? summary.expiring_7d : "-"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardDescription>Overdue</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary ? summary.overdue : "-"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search name or email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>

            <Select value={intervalFilter} onValueChange={(v) => { setIntervalFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Interval" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All intervals</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Effective status" /></SelectTrigger>
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
              <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="period_end:asc">Ending soonest</SelectItem>
                <SelectItem value="period_end:desc">Ending latest</SelectItem>
                <SelectItem value="usage:desc">Highest usage</SelectItem>
                <SelectItem value="usage:asc">Lowest usage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Subscribers</CardTitle>
          <CardDescription>{total} matching subscriber{total === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Monthly rate</TableHead>
                <TableHead>Period end</TableHead>
                <TableHead className="min-w-[150px]">Quota used</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="inline size-4 animate-spin mr-2" />
                    Loading subscribers...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No subscribers match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Link href={`/admin/users/${sub.id}`} className="font-medium text-sm hover:underline">
                        {sub.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{sub.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{sub.plan_name}</span>
                        {sub.billing_interval && (
                          <Badge variant="outline" className="capitalize text-xs">
                            {sub.billing_interval}
                          </Badge>
                        )}
                        {sub.has_pending_payment && (
                          <Badge variant="secondary" className="text-xs">
                            Pending payment
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      ${sub.monthly_rate_usd.toFixed(2)}/mo
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs whitespace-nowrap">
                          {formatShortDate(sub.current_period_end)}
                        </span>
                        {sub.is_overdue ? (
                          <Badge variant="destructive" className="text-xs">Overdue</Badge>
                        ) : sub.days_left !== null ? (
                          <span className="text-xs text-muted-foreground">({sub.days_left}d left)</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {sub.scheduled_used}
                            {sub.scheduled_limit !== null ? ` / ${sub.scheduled_limit}` : " (unlimited)"}
                          </span>
                          {sub.scheduled_limit !== null && <span>{sub.usage_percent}%</span>}
                        </div>
                        {sub.scheduled_limit !== null && (
                          <Progress value={sub.usage_percent} className="h-1.5" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell><AccountStatusPill status={sub.account_status} /></TableCell>
                    <TableCell className="text-right whitespace-nowrap space-x-1">
                      <Button variant="outline" size="sm" onClick={() => setPlanTarget(sub)}>
                        <Layers className="size-3.5 mr-1" />
                        Change plan
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Set subscription end date"
                        aria-label={`Set end date for ${sub.email}`}
                        onClick={() => setEndDateTarget(sub)}
                      >
                        <Calendar className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

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
