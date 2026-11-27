"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  CreditCard,
  Info,
  Lock,
  Wallet,
} from "lucide-react";

import {
  CopyButton,
  DataTableShell,
  DaysLeftChip,
  EmptyState,
  ErrorState,
  getPlanAccentColor,
  MethodBadge,
  PageHeader,
  PlanBadge,
  RelativeTime,
  StatusBadge,
  TableSkeleton,
  UsageBar,
} from "@/components/admin/shared";
import { PlanCards } from "@/components/app/PlanCards";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";

function computePeriodProgress(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  nowMs: number
): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const pct = ((nowMs - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function BillingClient({
  user,
}: {
  user: { id: string; name?: string | null; email: string };
}) {
  const [nowMs] = React.useState(() => Date.now());
  const { data: ent, isLoading: entLoading } = useEntitlements(user.id);
  const billingQuery = useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    refetchInterval: (q) => (q.state.data?.pending_payment ? 15000 : false),
    staleTime: 0,
  });

  const bStatus = billingQuery.data;
  const pendingPayment = bStatus?.pending_payment || null;
  const hasPending = Boolean(pendingPayment);
  const latestPayment = bStatus?.payments?.[0] || null;

  const endIso = bStatus?.period_end || ent?.current_period_end || ent?.trial_ends_at || null;
  const endFormatted = endIso
    ? new Date(endIso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    : null;
  const periodProgress = computePeriodProgress(ent?.current_period_start, endIso, nowMs);
  const hasDocs = ent
    ? ent.features.docs_token_limit === null || ent.features.docs_token_limit > 0
    : false;

  const planId = bStatus?.plan_id || ent?.plan_id || "trial";
  const planName = bStatus?.plan_name || ent?.plan_name || "Trial";

  // Priority single banner above main card
  let priorityBanner: React.ReactNode = null;
  if (!billingQuery.isLoading && !entLoading) {
    if (!hasPending && latestPayment?.status === "rejected") {
      priorityBanner = (
        <Alert className="border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200">
          <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-sm font-semibold">Latest payment was rejected</AlertTitle>
          <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span>
              Transaction <span className="font-mono">{latestPayment.transaction_id}</span> was not
              verified{latestPayment.reject_reason ? `: ${latestPayment.reject_reason}` : "."}
            </span>
            <Button asChild size="sm" variant="destructive">
              <Link
                href={`/app/checkout?plan=${latestPayment.plan_id}&interval=${latestPayment.billing_interval}`}
              >
                Try again
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      );
    } else if (pendingPayment) {
      priorityBanner = (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200">
          <Clock className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-sm font-semibold">
            Payment submitted — under review
          </AlertTitle>
          <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular-nums font-medium">
                Rs {pendingPayment.amount_pkr.toLocaleString()} ($
                {pendingPayment.amount_usd.toFixed(2)})
              </span>
              <span className="inline-flex items-center gap-1">
                Tx ID: <span className="font-mono font-medium">{pendingPayment.transaction_id}</span>
                <CopyButton
                  value={pendingPayment.transaction_id}
                  label="Copy transaction ID"
                  toastLabel="Transaction ID copied"
                  className="size-6"
                />
              </span>
              <span>
                Submitted <RelativeTime iso={pendingPayment.submitted_at} />
              </span>
              <span>Under review. We will email you when it is done.</span>
            </div>
          </AlertDescription>
        </Alert>
      );
    } else if (bStatus?.status === "expired") {
      priorityBanner = (
        <Alert className="border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200">
          <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-sm font-semibold">Your plan has ended</AlertTitle>
          <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span>Choose a plan below to resume automated scheduling and LinkedIn publishing.</span>
            <Button asChild size="sm" variant="destructive">
              <a href="#available-plans">Choose a plan</a>
            </Button>
          </AlertDescription>
        </Alert>
      );
    } else if (
      typeof bStatus?.days_left === "number" &&
      bStatus.days_left <= 7 &&
      planId !== "trial" &&
      planId !== "internal"
    ) {
      priorityBanner = (
        <Alert className="border-orange-500/40 bg-orange-500/10 text-orange-950 dark:text-orange-200">
          <AlertTriangle className="size-4 text-orange-600 dark:text-orange-400" />
          <AlertTitle className="text-sm font-semibold">Plan ending soon</AlertTitle>
          <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span>
              Your {planName} plan ends {endFormatted ? `on ${endFormatted}` : "soon"}. Plans do not
              renew automatically.
            </span>
            <Button asChild size="sm">
              <Link
                href={`/app/checkout?plan=${planId}&interval=${bStatus.billing_interval || "monthly"}`}
              >
                Renew now
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      );
    } else if (bStatus?.status === "trialing" || planId === "trial") {
      priorityBanner = (
        <Alert className="border-sky-500/40 bg-sky-500/10 text-sky-950 dark:text-sky-200">
          <Info className="size-4 text-sky-600 dark:text-sky-400" />
          <AlertTitle className="text-sm font-semibold">
            {typeof bStatus?.days_left === "number"
              ? `Free trial (${bStatus.days_left}d left)`
              : "Free trial"}
          </AlertTitle>
          <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span>
              {endFormatted
                ? `Your trial ends on ${endFormatted}. Choose a plan anytime to upgrade.`
                : "Your trial clock starts once setup is complete."}
            </span>
            <Button asChild size="sm" variant="outline">
              <a href="#available-plans">Choose a plan</a>
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Plan & Billing"
        description="Manage your AutoPulse plan, current quota usage, and manual payment history."
      />

      {priorityBanner}

      {entLoading || billingQuery.isLoading || !ent ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="lg:col-span-2 h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <Card
            className={cn(
              "lg:col-span-2 rounded-lg border-t-2 bg-card shadow-xs",
              getPlanAccentColor(planId)
            )}
          >
            <CardHeader className="pb-4 border-b border-border/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <PlanBadge planId={planId} planName={planName} />
                    <StatusBadge
                      kind="subscription"
                      value={hasPending ? "under_review" : bStatus?.status || ent.status}
                    />
                    {bStatus?.is_active === false && (
                      <Badge variant="outline" className="text-[11px]">
                        Archived plan
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-baseline gap-2 pt-1">
                    <CardTitle className="text-xl font-semibold tracking-tight">
                      {planName}
                    </CardTitle>
                    {typeof bStatus?.monthly_price_usd === "number" &&
                      bStatus.monthly_price_usd > 0 && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                          $
                          {bStatus.billing_interval === "annual" &&
                            typeof bStatus.annual_price_usd === "number"
                            ? `${bStatus.annual_price_usd.toFixed(2)}/year`
                            : `${bStatus.monthly_price_usd.toFixed(2)}/month`}
                        </span>
                      )}
                  </div>

                  {planId !== "internal" && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {endFormatted
                          ? `${bStatus?.status === "expired" ? "Ended" : "Ends"} on ${endFormatted} (plans do not renew automatically)`
                          : "Trial clock starts after setup"}
                      </span>
                      {typeof bStatus?.days_left === "number" && (
                        <DaysLeftChip
                          daysLeft={bStatus.days_left}
                          endDateIso={endIso}
                          isOverdue={bStatus.status === "expired"}
                        />
                      )}
                    </div>
                  )}
                </div>

                {!hasPending && planId !== "internal" && (
                  <Button
                    asChild
                    size="sm"
                    variant={bStatus?.status === "expired" ? "destructive" : "default"}
                  >
                    <a href="#available-plans">
                      <CreditCard className="size-3.5 mr-1.5" />
                      {bStatus?.status === "expired" ? "Renew plan" : "Upgrade"}
                    </a>
                  </Button>
                )}
              </div>

              {periodProgress !== null && planId !== "internal" && (
                <div className="pt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Paid period elapsed</span>
                    <span className="tabular-nums font-medium">{periodProgress}%</span>
                  </div>
                  <Progress value={periodProgress} className="h-1.5" />
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>

              {typeof bStatus?.monthly_price_usd === "number" && bStatus.monthly_price_usd > 0 && (
                <p className="text-[11px] text-muted-foreground border-t border-border/70 pt-3">
                  Note: Plan price changes apply only from your next payment and do not alter your
                  current paid period.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border bg-card shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Included features</CardTitle>
              <CardDescription>Entitlements active on your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Email approvals</span>
              </div>
              <div className="flex items-center gap-2.5">
                {ent.features.approval_slack ? (
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Lock className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className={ent.features.approval_slack ? "" : "text-muted-foreground"}>
                  Slack approvals
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                {hasDocs ? (
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Lock className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className={hasDocs ? "" : "text-muted-foreground"}>Business documents</span>
              </div>
              <div className="flex items-center gap-2.5">
                {ent.features.analytics_level !== "none" ? (
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Lock className="size-4 text-muted-foreground shrink-0" />
                )}
                <span
                  className={
                    ent.features.analytics_level !== "none" ? "" : "text-muted-foreground"
                  }
                >
                  Analytics: {ent.features.analytics_level}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div id="available-plans" className="space-y-3 scroll-mt-16">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Plans</h2>
          <p className="text-xs text-muted-foreground">
            Upgrade or switch anytime. Your new plan starts after payment verification.
          </p>
        </div>
        <PlanCards
          currentPlanId={ent?.plan_id}
          currentStatus={ent?.status}
          excludeTrial
          hasPendingPayment={hasPending}
        />
      </div>

      {billingQuery.isError ? (
        <ErrorState
          title="Could not load payment history"
          message="There was a problem loading your submitted payments."
          onRetry={() => billingQuery.refetch()}
        />
      ) : (
        <DataTableShell
          title="Payment history"
          description="Your recent manual QR payments and verification statuses."
        >
          {billingQuery.isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableSkeleton columns={7} rows={3} />
            </Table>
          ) : !bStatus?.payments || bStatus.payments.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payments submitted yet"
              description="Once you submit an Easypaisa or JazzCash transaction, it will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bStatus.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      <RelativeTime iso={p.submitted_at} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <PlanBadge planId={p.plan_id} planName={p.plan_name} />
                        <span className="capitalize text-muted-foreground">
                          ({p.billing_interval})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                      <div className="font-medium text-foreground">
                        Rs {p.amount_pkr.toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">${p.amount_usd.toFixed(2)}</div>
                    </TableCell>
                    <TableCell>
                      <MethodBadge method={p.method} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1">
                        <span className="font-mono">{p.transaction_id}</span>
                        <CopyButton
                          value={p.transaction_id}
                          label={`Copy ${p.transaction_id}`}
                          toastLabel="Transaction ID copied"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="payment" value={p.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {p.status === "voided"
                        ? p.void_reason || "Voided"
                        : p.status === "rejected"
                          ? p.reject_reason || "Rejected"
                          : p.note || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DataTableShell>
      )}
    </div>
  );
}
