"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { PlanCards } from "@/components/app/PlanCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBillingStatus } from "@/lib/api";
import { useEntitlements } from "@/lib/queries";

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {limit === null ? `${used} (unlimited)` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      {limit !== null && <Progress value={pct} className="h-2" />}
    </div>
  );
}

export function BillingClient({
  user,
}: {
  user: { id: string; name?: string | null; email: string };
}) {
  const { data: ent, isLoading: entLoading } = useEntitlements(user.id);
  const billingQuery = useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    refetchInterval: (q) => (q.state.data?.pending_payment ? 15000 : false),
    staleTime: 0,
  });

  const bStatus = billingQuery.data;
  const hasPending = Boolean(bStatus?.pending_payment);

  const badgeLabel = hasPending
    ? "Payment pending"
    : bStatus?.status === "trialing"
    ? "Trial"
    : bStatus?.status === "expired"
    ? "Expired"
    : "Active";

  const badgeVariant =
    bStatus?.status === "expired"
      ? "destructive"
      : hasPending
      ? "outline"
      : "secondary";

  const dateLabel =
    ent?.plan_id === "internal"
      ? "Unlimited internal access"
      : bStatus?.period_end
      ? `${bStatus.billing_interval ? `${bStatus.billing_interval === "annual" ? "Annual" : "Monthly"} · ` : ""}${
          bStatus.status === "expired" ? "Ended" : "Ends"
        } ${new Date(bStatus.period_end).toLocaleDateString()}${
          typeof bStatus.days_left === "number" ? ` (${bStatus.days_left} days left)` : ""
        }`
      : ent?.plan_id === "trial"
      ? "Trial clock starts after setup"
      : "Active";

  const hasDocs = ent ? ent.features.docs_token_limit === null || ent.features.docs_token_limit > 0 : false;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Plan & Billing"
        description="Manage your AutoPulse plan, monthly usage, and payment history."
      />

      {entLoading || billingQuery.isLoading || !ent ? (
        <Card className="h-44 animate-pulse bg-muted/40" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{bStatus?.plan_name || ent.plan_name}</CardTitle>
                    <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                  </div>
                  <CardDescription className="mt-1">{dateLabel}</CardDescription>
                </div>
                <Button asChild size="sm" variant={bStatus?.status === "expired" ? "destructive" : "default"}>
                  <Link href="/pricing">
                    {bStatus?.status === "expired" ? "Renew" : "Upgrade"}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <UsageBar
                label="Scheduled posts"
                used={ent.usage.scheduled_used}
                limit={ent.usage.scheduled_limit}
              />
              <UsageBar
                label="Playground runs (period)"
                used={ent.usage.playground_used}
                limit={ent.usage.playground_limit}
              />
              <UsageBar
                label="Playground runs (today)"
                used={ent.usage.playground_today_used}
                limit={ent.usage.playground_today_limit}
              />
              <UsageBar
                label="Business document tokens"
                used={ent.usage.docs_tokens_used}
                limit={ent.usage.docs_token_limit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Included features</CardTitle>
              <CardDescription>Features active on your current plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Check className="size-3.5 text-primary shrink-0" />
                <span>Email approvals</span>
              </div>
              <div className="flex items-center gap-2">
                {ent.features.approval_slack ? (
                  <Check className="size-3.5 text-primary shrink-0" />
                ) : (
                  <Lock className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className={ent.features.approval_slack ? "" : "text-muted-foreground"}>
                  Slack approvals
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasDocs ? (
                  <Check className="size-3.5 text-primary shrink-0" />
                ) : (
                  <Lock className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className={hasDocs ? "" : "text-muted-foreground"}>
                  Business documents
                </span>
              </div>
              <div className="flex items-center gap-2">
                {ent.features.analytics_level !== "none" ? (
                  <Check className="size-3.5 text-primary shrink-0" />
                ) : (
                  <Lock className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className={ent.features.analytics_level !== "none" ? "" : "text-muted-foreground"}>
                  Analytics: {ent.features.analytics_level}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment history table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment history</CardTitle>
          <CardDescription>Your recent manual QR payments and verification status.</CardDescription>
        </CardHeader>
        <CardContent>
          {billingQuery.isError ? (
            <p className="text-xs text-destructive">Could not load payment history right now.</p>
          ) : !bStatus?.payments || bStatus.payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No payments submitted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bStatus.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.plan_name} ({p.billing_interval})
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        Rs {p.amount_pkr.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{p.method}</TableCell>
                      <TableCell className="font-mono text-xs">{p.transaction_id}</TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant={
                            p.status === "approved"
                              ? "secondary"
                              : p.status === "rejected"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.status === "rejected" ? p.reject_reason || "Rejected" : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Plans</h2>
        <PlanCards currentPlanId={ent?.plan_id} />
      </div>
    </div>
  );
}
