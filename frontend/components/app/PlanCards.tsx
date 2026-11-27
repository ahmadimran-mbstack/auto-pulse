"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Lock, Sparkles } from "lucide-react";

import { getPlanAccentColor, PlanBadge } from "@/components/admin/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePublicPlans } from "@/lib/queries";
import { DOWNGRADE_TOOLTIP, isPlanDowngrade } from "@/lib/plan-rank";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/types/plans";

interface PlanCardsProps {
  currentPlanId?: PlanId;
  currentStatus?: string;
  highlightPlanId?: string | null;
  excludeTrial?: boolean;
  hasPendingPayment?: boolean;
}

export function PlanCards({
  currentPlanId,
  currentStatus,
  highlightPlanId,
  excludeTrial = false,
  hasPendingPayment = false,
}: PlanCardsProps) {
  const { data, isLoading } = usePublicPlans();
  const [interval, setInterval] = React.useState<"monthly" | "annual">("monthly");

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-80 rounded-lg" />
        ))}
      </div>
    );
  }

  const plans = excludeTrial
    ? data.plans.filter(
        (p) => p.is_purchasable ?? (p.id !== "trial" && !p.is_system && (p.monthly_price_usd ?? 0) > 0)
      )
    : data.plans;
  const annualPct = Math.round((data.annual_discount ?? 0.05) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={interval} onValueChange={(v) => setInterval(v as "monthly" | "annual")}>
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="annual" className="gap-1.5">
              <span>Annual</span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 h-5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0"
              >
                Save {annualPct}%
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {hasPendingPayment && (
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            A payment is currently under review. Switching plans is paused until verification finishes.
          </p>
        )}
      </div>

      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-4",
          plans.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
        )}
      >
        {plans.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          const isDowngrade = isPlanDowngrade({
            targetPlanId: plan.id,
            currentPlanId,
            currentStatus,
            plans: data.plans,
          });
          const isHighlighted = highlightPlanId === plan.id;
          const isFree = Boolean(plan.is_system || plan.monthly_price_usd === 0);
          const isAnnual = interval === "annual" && plan.annual_price_usd !== null;
          const displayUsd = isAnnual
            ? plan.annual_monthly_equivalent_usd
            : plan.monthly_price_usd;
          const displayPkr = isAnnual
            ? plan.annual_monthly_equivalent_pkr_approx
            : plan.monthly_price_pkr_approx;
          const docsLimit = plan.features.docs_token_limit ?? 0;
          const ctaLabel =
            currentPlanId && currentPlanId !== "trial" && currentPlanId !== "internal"
              ? `Switch to ${plan.name}`
              : `Upgrade to ${plan.name}`;

          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col justify-between rounded-lg border-t-2 bg-card shadow-xs transition-colors duration-150",
                getPlanAccentColor(plan.id),
                isCurrent && "ring-2 ring-primary/25 border-primary/50",
                isHighlighted && !isCurrent && "ring-2 ring-violet-500/30 border-violet-500/50"
              )}
            >
              <div>
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 min-h-[24px]">
                    <PlanBadge planId={plan.id} planName={plan.name} />
                    <div className="flex items-center gap-1.5">
                      {plan.is_popular && (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                        >
                          <Sparkles className="size-2.5" />
                          Popular
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge variant="secondary" className="text-[10px]">
                          Current
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                        ${displayUsd === 0 ? "0" : displayUsd?.toFixed(2) ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isFree ? `/ ${plan.plan_length_days} days` : "/ month"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                      approx. Rs {displayPkr?.toLocaleString() ?? 0}
                    </p>
                    {isAnnual && plan.annual_price_usd !== null && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                        ${plan.annual_price_usd.toFixed(2)} billed yearly (approx. Rs{" "}
                        {plan.annual_price_pkr_approx?.toLocaleString()})
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-2.5 text-xs pt-1">
                  <div className="flex items-start gap-2">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      {plan.limits.scheduled_posts === null
                        ? "Unlimited scheduled posts"
                        : `${plan.limits.scheduled_posts} scheduled posts${isFree ? " total" : "/month"}`}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      {plan.limits.playground_runs === null
                        ? "Unlimited Playground runs"
                        : `${plan.limits.playground_runs} Playground runs${isFree ? " total" : "/month"}${
                            plan.limits.playground_runs_per_day !== null
                              ? ` (${plan.limits.playground_runs_per_day}/day)`
                              : ""
                          }`}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    {plan.features.approval_slack ? (
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Lock className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className={plan.features.approval_slack ? "" : "text-muted-foreground"}>
                      Slack + email approval
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    {plan.features.docs_token_limit === null || docsLimit > 0 ? (
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Lock className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span
                      className={
                        plan.features.docs_token_limit === null || docsLimit > 0
                          ? ""
                          : "text-muted-foreground"
                      }
                    >
                      {plan.features.docs_token_limit === null
                        ? "Unlimited doc tokens"
                        : docsLimit > 0
                          ? `${docsLimit.toLocaleString()} doc tokens`
                          : "Business documents"}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    {plan.features.analytics_level !== "none" ? (
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Lock className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className={plan.features.analytics_level !== "none" ? "" : "text-muted-foreground"}>
                      Analytics: {plan.features.analytics_level}
                    </span>
                  </div>

                  {(plan.extra_features ?? []).map((feat) => (
                    <div key={feat} className="flex items-start gap-2">
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}

                  <CardDescription className="pt-1 text-[11px]">
                    Support: {plan.features.support}
                  </CardDescription>
                </CardContent>
              </div>

              <CardFooter className="pt-4">
                {isCurrent || isFree ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled
                  >
                    {isCurrent ? "Current plan" : "Included"}
                  </Button>
                ) : isDowngrade ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full">
                        <Button className="w-full" variant="secondary" disabled>
                          {ctaLabel}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{DOWNGRADE_TOOLTIP}</TooltipContent>
                  </Tooltip>
                ) : hasPendingPayment ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full">
                        <Button className="w-full" variant="secondary" disabled>
                          {ctaLabel}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Wait for your pending payment review to finish first.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button asChild className="w-full" variant="default">
                    <Link href={`/app/checkout?plan=${plan.id}&interval=${interval}`}>
                      {ctaLabel}
                    </Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
