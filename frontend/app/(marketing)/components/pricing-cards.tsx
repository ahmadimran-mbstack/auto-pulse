"use client";

import React from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DOWNGRADE_TOOLTIP, isPlanDowngrade } from "@/lib/plan-rank";
import type { PublicPlansResponse } from "@/types/plans";
import { useSessionStatus } from "./use-session-status";

export function LandingPricingCards({ data }: { data: PublicPlansResponse }) {
  const [interval, setInterval] = React.useState<"monthly" | "annual">("monthly");
  const { isLoaded, isSignedIn, currentPlanId, currentStatus } = useSessionStatus();
  const trialDays = data.trial_days ?? 3;
  const annualPct = Math.round((data.annual_discount ?? 0.05) * 100);

  const getPlanHref = (planId: string, isFreeTrial: boolean) => {
    if (isFreeTrial) {
      return isLoaded && isSignedIn ? "/app" : "/auth/sign-up";
    }
    const checkoutUrl = `/app/checkout?plan=${planId}&interval=${interval}`;
    return isLoaded && isSignedIn
      ? checkoutUrl
      : `/auth/sign-up?returnTo=${encodeURIComponent(checkoutUrl)}`;
  };

  return (
    <TooltipProvider>
      <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <p className="text-3xl md:text-5xl font-normal tracking-tight text-[var(--lp-text-heading)]">
            Simple plans for consistent LinkedIn publishing
          </p>
          <p className="text-sm text-[var(--lp-text-muted)]">
            Start with a {trialDays}-day free trial. Every plan includes LinkedIn publishing and email approvals.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Billing interval"
          className="inline-flex items-center rounded-full border border-[var(--lp-border-hairline)] bg-[var(--lp-navy-deep)] p-1 self-start sm:self-auto"
        >
          <button
            type="button"
            role="radio"
            aria-checked={interval === "monthly"}
            onClick={() => setInterval("monthly")}
            className={`px-4 py-1.5 rounded-full text-xs transition-colors ${interval === "monthly"
              ? "bg-[var(--lp-ice)] text-[#08090C] font-medium"
              : "text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)]"
              }`}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={interval === "annual"}
            onClick={() => setInterval("annual")}
            className={`px-4 py-1.5 rounded-full text-xs transition-colors ${interval === "annual"
              ? "bg-[var(--lp-ice)] text-[#08090C] font-medium"
              : "text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)]"
              }`}
          >
            Annual ({annualPct}% off)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {data.plans.map((plan) => {
          const isFreeTrial = Boolean(plan.is_system || plan.monthly_price_usd === 0);
          const isAnnual = interval === "annual" && plan.annual_price_usd !== null;
          const monthlyUsd = isAnnual
            ? plan.annual_monthly_equivalent_usd
            : plan.monthly_price_usd;
          const monthlyPkr = isAnnual
            ? plan.annual_monthly_equivalent_pkr_approx
            : plan.monthly_price_pkr_approx;

          const docsLimit = plan.features.docs_token_limit ?? 0;
          const schedTxt =
            plan.limits.scheduled_posts === null
              ? "Unlimited"
              : `${plan.limits.scheduled_posts}${isFreeTrial ? " total" : "/month"}`;
          const pgTxt =
            plan.limits.playground_runs === null
              ? "Unlimited"
              : `${plan.limits.playground_runs}${isFreeTrial ? " total" : "/month"}${
                  plan.limits.playground_runs_per_day !== null
                    ? ` (${plan.limits.playground_runs_per_day}/day)`
                    : ""
                }`;

          const rows: { label: string; included: boolean }[] = [
            { label: `Scheduled posts: ${schedTxt}`, included: true },
            { label: `Playground runs: ${pgTxt}`, included: true },
            {
              label: plan.features.approval_slack ? "Slack approval: included" : "Slack approval: no",
              included: plan.features.approval_slack,
            },
            {
              label:
                plan.features.docs_token_limit === null
                  ? "Business documents: unlimited tokens"
                  : docsLimit > 0
                    ? `Business documents: ${docsLimit.toLocaleString()} tokens`
                    : "Business documents: no",
              included: plan.features.docs_token_limit === null || docsLimit > 0,
            },
            {
              label: `Analytics: ${plan.features.analytics_level}`,
              included: plan.features.analytics_level !== "none",
            },
            {
              label: `Support: ${plan.features.support}`,
              included: true,
            },
            ...(plan.extra_features ?? []).map((feat) => ({
              label: feat,
              included: true,
            })),
            {
              label: "Facebook and Instagram: coming soon",
              included: false,
            },
          ];

          return (
            <div
              key={plan.id}
              className="flex flex-col justify-between rounded-xl border border-[var(--lp-border-hairline)] bg-[var(--lp-navy-deep)]/70 p-6 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--lp-border-hover)]"
            >
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-normal text-[var(--lp-text-heading)]">
                      {plan.name}
                    </h3>
                    {plan.is_popular && (
                      <Badge
                        variant="secondary"
                        className="bg-[var(--lp-ice)]/15 text-[var(--lp-ice)] border border-[var(--lp-ice)]/30 text-[10px] font-normal"
                      >
                        Popular
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-3xl font-normal tracking-tight text-[var(--lp-text-heading)] tabular-nums">
                      ${monthlyUsd === 0 ? "0" : monthlyUsd?.toFixed(2) ?? "-"}
                    </span>
                    <span className="text-xs text-[var(--lp-text-muted)]">
                      {isFreeTrial ? `/ ${plan.plan_length_days} days` : "/ month"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--lp-text-muted)] tabular-nums">
                    about Rs {monthlyPkr?.toLocaleString() ?? 0}
                  </p>
                  {isAnnual && plan.annual_price_usd !== null && (
                    <p className="mt-1 text-xs text-[var(--lp-ice)] tabular-nums">
                      ${plan.annual_price_usd.toFixed(2)} / year (about Rs{" "}
                      {plan.annual_price_pkr_approx?.toLocaleString()})
                    </p>
                  )}
                </div>

                <ul className="space-y-2.5 text-xs">
                  {rows.map((row) => (
                    <li key={row.label} className="flex items-start gap-2">
                      {row.included ? (
                        <Check className="w-3.5 h-3.5 mt-0.5 text-[var(--lp-ice)] shrink-0" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 mt-0.5 text-[var(--lp-text-muted)] shrink-0" />
                      )}
                      <span
                        className={
                          row.included
                            ? "text-[var(--lp-text-heading)]"
                            : "text-[var(--lp-text-muted)]"
                        }
                      >
                        {row.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6 mt-6 border-t border-[var(--lp-border-hairline)]">
                {isLoaded &&
                isSignedIn &&
                isPlanDowngrade({
                  targetPlanId: plan.id,
                  currentPlanId,
                  currentStatus,
                  plans: data.plans,
                }) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex w-full">
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--lp-border-hairline)] bg-[var(--lp-ice)] px-4 py-2 text-xs font-medium text-[#08090C] opacity-50 cursor-not-allowed"
                        >
                          {isFreeTrial ? "Go to dashboard" : `Choose ${plan.name}`}
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{DOWNGRADE_TOOLTIP}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Link
                    href={getPlanHref(plan.id, isFreeTrial)}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--lp-border-hairline)] bg-[var(--lp-ice)] px-4 py-2 text-xs font-medium text-[#08090C] transition-opacity hover:opacity-90"
                  >
                    {isFreeTrial
                      ? isSignedIn
                        ? "Go to dashboard"
                        : "Start free trial"
                      : isSignedIn
                        ? `Choose ${plan.name}`
                        : `Get ${plan.name}`}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Link
          href="/pricing"
          className="text-xs text-[var(--lp-ice)] hover:underline underline-offset-4"
        >
          Compare all plans &rarr;
        </Link>
      </div>
    </div>
    </TooltipProvider>
  );
}
