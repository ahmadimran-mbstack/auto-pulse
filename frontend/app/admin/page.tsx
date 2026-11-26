"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Cpu,
  DollarSign,
  History,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ADMIN_ACTIVITY_CHART_CONFIG,
  ADMIN_PLAN_CHART_CONFIG,
  ADMIN_REV_COST_CHART_CONFIG,
  CHART_AXIS_PROPS,
  CHART_GRID_PROPS,
  ChartEmptyState,
  CopyButton,
  DataTableShell,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanBadge,
  RelativeTime,
  StatCard,
  StatCardSkeleton,
  StatusBadge,
} from "@/components/admin/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminOverview } from "@/lib/api";

export default function AdminOverviewPage() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(false),
    staleTime: 60_000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await getAdminOverview(true);
      qc.setQueryData(["admin-overview"], fresh);
    } finally {
      setRefreshing(false);
    }
  };

  const data = overviewQuery.data;
  const k = data?.kpis;

  const hasRevCostData = Boolean(
    data?.daily_series?.some((d) => (d.revenue_usd || 0) > 0 || (d.cost_usd || 0) > 0)
  );
  const hasPlanData = Boolean(data?.plan_breakdown?.some((p) => (p.total || 0) > 0));
  const hasActivityData = Boolean(
    data?.daily_series?.some(
      (d) => (d.generated || 0) > 0 || (d.published || 0) > 0 || (d.failed || 0) > 0
    )
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`Platform metrics for ${data?.month_utc || "current UTC month"} (UTC).`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="h-5 text-[10px] font-medium">
                  {data.cached ? "Cached 60s" : "Live"}
                </Badge>
                <span>Updated</span>
                <RelativeTime iso={data.generated_at} className="text-foreground font-medium" />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing || overviewQuery.isLoading}
              onClick={handleRefresh}
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${refreshing ? "motion-safe:animate-spin" : ""}`}
              />
              Refresh data
            </Button>
          </div>
        }
      />

      {k && k.pending_payments_count > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              <strong>{k.pending_payments_count}</strong> pending payment
              {k.pending_payments_count === 1 ? "" : "s"} (${k.pending_payments_usd.toFixed(2)})
              awaiting manual verification.
            </span>
            <Link
              href="/admin/payments"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:opacity-80"
            >
              Review payments
              <ArrowRight className="size-3.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {k && k.failed_emails_count > 0 && (
        <Alert className="border-red-500/35 bg-red-500/10 text-red-900 dark:text-red-200">
          <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              <strong>{k.failed_emails_count}</strong> failed notification email
              {k.failed_emails_count === 1 ? "" : "s"} logged.
            </span>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:opacity-80"
            >
              Inspect users
              <ArrowRight className="size-3.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {overviewQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <StatCardSkeleton key={idx} />
          ))}
        </div>
      ) : overviewQuery.isError || !data || !k ? (
        <ErrorState
          title="Could not load admin overview"
          message="There was a problem loading platform KPIs and charts."
          onRetry={() => overviewQuery.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total users"
              value={k.total_users.toLocaleString()}
              icon={Users}
              tone="sky"
              delta={
                k.new_users_month > 0
                  ? { value: `+${k.new_users_month} this mo`, positive: true }
                  : undefined
              }
              subline={`${k.active_users} active · ${k.suspended_users} suspended · ${k.disabled_users} disabled`}
              href="/admin/users"
            />
            <StatCard
              label="Estimated MRR"
              value={`$${k.estimated_mrr_usd.toFixed(2)}`}
              icon={TrendingUp}
              tone="violet"
              subline={`${k.paid_subscribers} paid active · ${k.trial_users} trialing · ${k.expiring_7d} expiring`}
              href="/admin/subscribers"
            />
            <StatCard
              label="Approved revenue (month)"
              value={`$${k.revenue_month_usd.toFixed(2)}`}
              icon={DollarSign}
              tone="emerald"
              subline={`Rs ${k.revenue_month_pkr.toLocaleString()} · All-time $${k.revenue_all_time_usd.toFixed(2)}`}
              href="/admin/payments"
            />
            <StatCard
              label="AI & search cost (month)"
              value={`$${k.cost_month_usd.toFixed(4)}`}
              icon={Cpu}
              tone="amber"
              subline={`Today $${k.cost_today_usd.toFixed(4)} · ${k.tokens_month.toLocaleString()} tokens`}
              href="/admin/usage"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="rounded-lg border-border bg-card shadow-xs flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  Revenue vs AI Cost (Last 30 UTC days)
                </CardTitle>
                <CardDescription>
                  Daily approved payment revenue and LLM/search spend in USD.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pt-2">
                {hasRevCostData ? (
                  <ChartContainer config={ADMIN_REV_COST_CHART_CONFIG} className="h-64 w-full aspect-auto">
                    <BarChart data={data.daily_series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid {...CHART_GRID_PROPS} />
                      <XAxis dataKey="short_date" minTickGap={20} {...CHART_AXIS_PROPS} />
                      <YAxis {...CHART_AXIS_PROPS} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="revenue_usd" fill="var(--color-revenue_usd)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cost_usd" fill="var(--color-cost_usd)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <ChartEmptyState message="No revenue or AI cost recorded in the last 30 days." />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg border-border bg-card shadow-xs flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Subscribers by Plan</CardTitle>
                <CardDescription>
                  Active vs total subscription records per tier.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pt-2">
                {hasPlanData ? (
                  <ChartContainer config={ADMIN_PLAN_CHART_CONFIG} className="h-64 w-full aspect-auto">
                    <BarChart data={data.plan_breakdown} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid {...CHART_GRID_PROPS} />
                      <XAxis dataKey="plan_name" {...CHART_AXIS_PROPS} />
                      <YAxis allowDecimals={false} {...CHART_AXIS_PROPS} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="active" fill="var(--color-active)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <ChartEmptyState message="No subscriber distribution data yet." />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-lg border-border bg-card shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Daily Generation &amp; Publishing (Last 30 UTC days)
              </CardTitle>
              <CardDescription>
                Scheduled drafts generated ({k.posts_generated_month} this mo), published (
                {k.posts_published_month}), and failed ({k.failed_runs_month}).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {hasActivityData ? (
                <ChartContainer config={ADMIN_ACTIVITY_CHART_CONFIG} className="h-64 w-full aspect-auto">
                  <BarChart data={data.daily_series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="short_date" minTickGap={20} {...CHART_AXIS_PROPS} />
                    <YAxis allowDecimals={false} {...CHART_AXIS_PROPS} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="generated" fill="var(--color-generated)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="published" fill="var(--color-published)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" fill="var(--color-failed)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <ChartEmptyState message="No generation or publishing activity in the last 30 days." />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DataTableShell
              title="Recent pending payments"
              description="Oldest pending submissions awaiting review"
              headerActions={
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/payments">View all</Link>
                </Button>
              }
            >
              {data.pending_payments.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No pending payments"
                  description="All submitted QR transactions have been reviewed."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Transaction ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pending_payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs max-w-[160px] truncate">
                          <Link
                            href={`/admin/users/${p.user_id}`}
                            className="font-medium hover:underline text-foreground"
                          >
                            {p.user_email}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <PlanBadge planId={p.plan_name.toLowerCase()} planName={p.plan_name} />
                            <span className="capitalize text-muted-foreground">
                              ({p.billing_interval})
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                          <div>${p.amount_usd.toFixed(2)}</div>
                          <div className="text-muted-foreground">
                            Rs {p.amount_pkr.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <span className="font-mono truncate max-w-[110px]">
                              {p.transaction_id}
                            </span>
                            <CopyButton
                              value={p.transaction_id}
                              label={`Copy ${p.transaction_id}`}
                              toastLabel="Transaction ID copied"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataTableShell>

            <DataTableShell
              title="Recent admin audit logs"
              description="Latest 10 recorded admin actions"
            >
              {data.recent_audit_logs.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No audit events yet"
                  description="Admin mutations will appear here in chronological order."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent_audit_logs.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs max-w-[140px] truncate">
                          {a.actor_email}
                        </TableCell>
                        <TableCell className="text-xs">
                          <StatusBadge kind="run" value={a.action} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                          {a.target_email || a.target_id || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground text-right">
                          <RelativeTime iso={a.created_at} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataTableShell>
          </div>
        </>
      )}
    </div>
  );
}
