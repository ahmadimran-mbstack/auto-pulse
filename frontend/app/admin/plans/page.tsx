"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminPlansOverview } from "@/lib/api";

function fmtLimit(val: number | null, suffix: string = "") {
  if (val === null || val === undefined) return "Unlimited";
  return `${val.toLocaleString()}${suffix}`;
}

export default function AdminPlansPage() {
  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: getAdminPlansOverview,
    staleTime: 60_000,
  });

  const data = plansQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
        <p className="text-sm text-muted-foreground">
          Read-only configuration from <code className="font-mono text-xs">plans.py</code> with live subscriber counts.
          {data && (
            <>
              {" "}
              ({data.currency}, 1 USD = Rs {data.pkr_per_usd}, {Math.round(data.annual_discount * 100)}% annual discount)
            </>
          )}
        </p>
      </div>

      {plansQuery.isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="inline size-4 animate-spin mr-2" />
          Loading plans...
        </div>
      ) : plansQuery.isError || !data ? (
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-center text-sm text-destructive">
            Could not load plans.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((p) => (
              <Card key={p.id} className="border-border bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge variant={p.is_public ? "outline" : "secondary"}>
                      {p.is_public ? "Public" : "Internal"}
                    </Badge>
                  </div>
                  <CardDescription>
                    {p.monthly_price_usd === null
                      ? "Custom / No billing"
                      : p.monthly_price_usd === 0
                        ? "Free (3 days)"
                        : `$${p.monthly_price_usd.toFixed(2)}/mo · Annual $${p.annual_price_usd?.toFixed(2)}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subscribers (active / total)</span>
                    <span className="font-medium tabular-nums">
                      {p.subscribers.active} / {p.subscribers.total}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scheduled posts / period</span>
                    <span className="font-medium">{fmtLimit(p.limits.scheduled_posts_per_period)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Playground (period / day)</span>
                    <span className="font-medium">
                      {fmtLimit(p.limits.playground_runs_per_period)} / {fmtLimit(p.limits.playground_runs_per_day)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max post days / week</span>
                    <span className="font-medium">{fmtLimit(p.limits.max_post_days_per_week)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily spend limit</span>
                    <span className="font-medium">
                      {p.limits.daily_spend_limit_usd !== null
                        ? `$${p.limits.daily_spend_limit_usd.toFixed(2)}`
                        : "Unlimited"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Docs token limit</span>
                    <span className="font-medium">{fmtLimit(p.limits.docs_token_limit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approvals</span>
                    <span className="font-medium">
                      {p.features.approval_email ? "Email" : "-"}
                      {p.features.approval_slack ? " + Slack" : ""}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Rate Limits &amp; Pricing Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Monthly (USD / PKR)</TableHead>
                    <TableHead>Annual (USD / PKR)</TableHead>
                    <TableHead>API / min</TableHead>
                    <TableHead>Generate / hr</TableHead>
                    <TableHead>Payment submit / hr</TableHead>
                    <TableHead>Analytics</TableHead>
                    <TableHead>Support</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {p.monthly_price_usd !== null
                          ? `$${p.monthly_price_usd.toFixed(2)} (Rs ${p.monthly_price_pkr_approx?.toLocaleString()})`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {p.annual_price_usd !== null
                          ? `$${p.annual_price_usd.toFixed(2)} (Rs ${p.annual_price_pkr_approx?.toLocaleString()})`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{p.rate_limits.api_per_min ?? "-"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{p.rate_limits.generate_per_hour ?? "-"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{p.rate_limits.payment_submit_per_hour ?? "-"}</TableCell>
                      <TableCell className="text-xs capitalize">{p.features.analytics_level}</TableCell>
                      <TableCell className="text-xs">{p.features.support_label}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
