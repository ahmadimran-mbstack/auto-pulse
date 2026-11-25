"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
  type ChartConfig,
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

const revCostConfig = {
  revenue_usd: {
    label: "Approved revenue ($)",
    color: "var(--chart-1)",
  },
  cost_usd: {
    label: "AI & search cost ($)",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const planConfig = {
  active: {
    label: "Active",
    color: "var(--chart-1)",
  },
  total: {
    label: "Total",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

const activityConfig = {
  generated: {
    label: "Generated",
    color: "var(--chart-1)",
  },
  published: {
    label: "Published",
    color: "var(--chart-2)",
  },
  failed: {
    label: "Failed",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Platform metrics for {data?.month_utc || "current UTC month"} (UTC).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="outline" className="text-xs font-normal">
              {data.cached ? "Cached (60s)" : "Live"} · {formatDateTime(data.generated_at)}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing || overviewQuery.isLoading}
            onClick={handleRefresh}
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {k && (k.pending_payments_count > 0 || k.failed_emails_count > 0) && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="size-4 text-amber-600" />
          <AlertDescription className="flex flex-wrap items-center gap-4 text-sm">
            {k.pending_payments_count > 0 && (
              <span>
                <strong>{k.pending_payments_count}</strong> pending payment
                {k.pending_payments_count === 1 ? "" : "s"} waiting for review.{" "}
                <Link href="/admin/payments" className="underline font-medium">
                  Review payments
                </Link>
              </span>
            )}
            {k.failed_emails_count > 0 && (
              <span>
                <strong>{k.failed_emails_count}</strong> failed email notification
                {k.failed_emails_count === 1 ? "" : "s"} logged.{" "}
                <Link href="/admin/users" className="underline font-medium">
                  Inspect users
                </Link>
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {overviewQuery.isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="inline size-4 animate-spin mr-2" />
          Loading overview metrics...
        </div>
      ) : overviewQuery.isError || !data || !k ? (
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-center text-sm text-destructive">
            Could not load admin overview.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>Total users</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{k.total_users}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div>+{k.new_users_month} this UTC month</div>
                <div>
                  {k.active_users} active · {k.suspended_users} suspended · {k.disabled_users} disabled
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>Estimated MRR</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  ${k.estimated_mrr_usd.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div>
                  {k.paid_subscribers} paid active · {k.trial_users} trialing
                </div>
                <div>
                  {k.expiring_7d} expiring in 7d · {k.overdue} overdue
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>Approved revenue (UTC month)</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  ${k.revenue_month_usd.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div>Rs {k.revenue_month_pkr.toLocaleString()} · All-time ${k.revenue_all_time_usd.toFixed(2)}</div>
                <div>
                  Pending: {k.pending_payments_count} (${k.pending_payments_usd.toFixed(2)})
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardDescription>AI &amp; search cost (UTC month)</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  ${k.cost_month_usd.toFixed(4)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-0.5">
                <div>Today: ${k.cost_today_usd.toFixed(4)} · {k.tokens_month.toLocaleString()} tokens</div>
                <div>
                  {k.posts_generated_month} gen · {k.posts_published_month} pub · {k.failed_runs_month} failed
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Revenue vs AI Cost (Last 30 UTC days)</CardTitle>
                <CardDescription>Daily approved payment revenue and LLM/search spend in USD.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={revCostConfig} className="h-64 w-full aspect-auto">
                  <BarChart data={data.daily_series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="short_date" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="revenue_usd" fill="var(--color-revenue_usd)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cost_usd" fill="var(--color-cost_usd)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Subscribers by Plan</CardTitle>
                <CardDescription>Active vs total subscription records per plan.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={planConfig} className="h-64 w-full aspect-auto">
                  <BarChart data={data.plan_breakdown} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="plan_name" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="active" fill="var(--color-active)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Daily Generation &amp; Publishing (Last 30 UTC days)</CardTitle>
              <CardDescription>Scheduled drafts generated, LinkedIn posts published, and failed runs.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={activityConfig} className="h-64 w-full aspect-auto">
                <BarChart data={data.daily_series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="short_date" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="generated" fill="var(--color-generated)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="published" fill="var(--color-published)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" fill="var(--color-failed)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Pending Payments Queue</CardTitle>
                  <CardDescription>Oldest pending submissions awaiting review</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/payments">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Tx ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pending_payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                          No pending payments.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.pending_payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">
                            <Link href={`/admin/users/${p.user_id}`} className="hover:underline">
                              {p.user_email}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs">{p.plan_name} ({p.billing_interval})</TableCell>
                          <TableCell className="text-xs tabular-nums">
                            ${p.amount_usd.toFixed(2)} / Rs {p.amount_pkr.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{p.transaction_id}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Recent Admin Audit Logs</CardTitle>
                <CardDescription>Latest 10 recorded admin actions</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent_audit_logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                          No audit logs yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.recent_audit_logs.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{a.actor_email}</TableCell>
                          <TableCell className="text-xs font-mono">{a.action}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {a.target_email || a.target_id || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(a.created_at)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
