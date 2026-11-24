"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { env } from "@/lib/env";
import { usePublicPlans } from "@/lib/queries";
import type { PlanId, PublicPlan } from "@/types/plans";

interface PlanCardsProps {
  currentPlanId?: PlanId;
  highlightPlanId?: string | null;
  excludeTrial?: boolean;
}

export function PlanCards({ currentPlanId, highlightPlanId, excludeTrial = false }: PlanCardsProps) {
  const { data, isLoading } = usePublicPlans();
  const [interval, setInterval] = React.useState<"monthly" | "annual">("monthly");

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-72 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  const plans = excludeTrial ? data.plans.filter((p) => p.id !== "trial") : data.plans;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={interval} onValueChange={(v) => setInterval(v as "monthly" | "annual")}>
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="annual">
              Annual <Badge variant="secondary" className="ml-1.5 text-[10px]">5% off</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          const isHighlighted = highlightPlanId === plan.id;
          const isAnnual = interval === "annual" && plan.annual_price_usd !== null;
          const displayUsd = isAnnual ? plan.annual_monthly_equivalent_usd : plan.monthly_price_usd;
          const displayPkr = isAnnual
            ? plan.annual_monthly_equivalent_pkr_approx
            : plan.monthly_price_pkr_approx;

          return (
            <Card
              key={plan.id}
              className={
                isHighlighted
                  ? "border-primary flex flex-col justify-between"
                  : "flex flex-col justify-between"
              }
            >
              <div>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                  </div>
                  <div className="pt-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold tracking-tight">
                        ${displayUsd === 0 ? "0" : displayUsd?.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {plan.id === "trial" ? `/ ${plan.plan_length_days} days` : "/ month"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      about Rs {displayPkr?.toLocaleString() ?? 0}
                    </p>
                    {isAnnual && plan.annual_price_usd !== null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ${plan.annual_price_usd.toFixed(2)} billed yearly (about Rs{" "}
                        {plan.annual_price_pkr_approx?.toLocaleString()})
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="size-3.5 text-primary shrink-0" />
                    <span>
                      {plan.limits.scheduled_posts} scheduled posts{plan.id === "trial" ? " total" : "/month"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="size-3.5 text-primary shrink-0" />
                    <span>
                      {plan.limits.playground_runs} Playground runs{plan.id === "trial" ? " total" : "/month"} (
                      {plan.limits.playground_runs_per_day}/day)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.features.approval_slack ? (
                      <Check className="size-3.5 text-primary shrink-0" />
                    ) : (
                      <Lock className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className={plan.features.approval_slack ? "" : "text-muted-foreground"}>
                      Slack + email approval
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.features.docs_token_limit > 0 ? (
                      <Check className="size-3.5 text-primary shrink-0" />
                    ) : (
                      <Lock className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className={plan.features.docs_token_limit > 0 ? "" : "text-muted-foreground"}>
                      {plan.features.docs_token_limit > 0
                        ? `${plan.features.docs_token_limit.toLocaleString()} doc tokens`
                        : "Business documents"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.features.analytics_level !== "none" ? (
                      <Check className="size-3.5 text-primary shrink-0" />
                    ) : (
                      <Lock className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className={plan.features.analytics_level !== "none" ? "" : "text-muted-foreground"}>
                      Analytics: {plan.features.analytics_level}
                    </span>
                  </div>
                  <CardDescription className="pt-1 text-[11px]">
                    Support: {plan.features.support}
                  </CardDescription>
                </CardContent>
              </div>
              <CardFooter>
                {isCurrent || plan.id === "trial" ? (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled
                  >
                    {isCurrent ? "Current plan" : "Included"}
                  </Button>
                ) : (
                  <Button asChild className="w-full" variant="default">
                    <Link href={`/app/checkout?plan=${plan.id}&interval=${interval}`}>
                      Choose {plan.name}
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
