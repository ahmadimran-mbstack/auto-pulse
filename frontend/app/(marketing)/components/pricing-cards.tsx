"use client";

import React from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

import type { PublicPlansResponse } from "@/types/plans";
import { useSessionStatus } from "./use-session-status";

export function LandingPricingCards({ data }: { data: PublicPlansResponse }) {
  const [interval, setInterval] = React.useState<"monthly" | "annual">("monthly");
  const { isLoaded, isSignedIn } = useSessionStatus();
  const getPlanHref = (planId: string) => {
    if (planId === "trial") {
      return isLoaded && isSignedIn ? "/app" : "/auth/sign-up";
    }
    const checkoutUrl = `/app/checkout?plan=${planId}&interval=${interval}`;
    return isLoaded && isSignedIn
      ? checkoutUrl
      : `/auth/sign-up?returnTo=${encodeURIComponent(checkoutUrl)}`;
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <p className="text-3xl md:text-5xl font-normal tracking-tight text-[var(--lp-text-heading)]">
            Simple plans for consistent LinkedIn publishing
          </p>
          <p className="text-sm text-[var(--lp-text-muted)]">
            Start with a 3-day free trial. Every plan includes LinkedIn publishing and email approvals.
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
            Annual (5% off)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {data.plans.map((plan) => {
          const isAnnual = interval === "annual" && plan.annual_price_usd !== null;
          const monthlyUsd = isAnnual
            ? plan.annual_monthly_equivalent_usd
            : plan.monthly_price_usd;
          const monthlyPkr = isAnnual
            ? plan.annual_monthly_equivalent_pkr_approx
            : plan.monthly_price_pkr_approx;

          const rows: { label: string; included: boolean }[] = [
            {
              label: `Scheduled posts: ${plan.limits.scheduled_posts}${plan.id === "trial" ? " total" : "/month"
                }`,
              included: true,
            },
            {
              label: `Playground runs: ${plan.limits.playground_runs}${plan.id === "trial" ? " total" : "/month"
                } (${plan.limits.playground_runs_per_day}/day)`,
              included: true,
            },
            {
              label: plan.features.approval_slack ? "Slack approval: included" : "Slack approval: no",
              included: plan.features.approval_slack,
            },
            {
              label:
                plan.features.docs_token_limit > 0
                  ? `Business documents: ${plan.features.docs_token_limit.toLocaleString()} tokens`
                  : "Business documents: no",
              included: plan.features.docs_token_limit > 0,
            },
            {
              label: `Analytics: ${plan.features.analytics_level}`,
              included: plan.features.analytics_level !== "none",
            },
            {
              label: `Support: ${plan.features.support}`,
              included: true,
            },
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
                  <h3 className="text-base font-normal text-[var(--lp-text-heading)]">
                    {plan.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-3xl font-normal tracking-tight text-[var(--lp-text-heading)] tabular-nums">
                      ${monthlyUsd === 0 ? "0" : monthlyUsd?.toFixed(2)}
                    </span>
                    <span className="text-xs text-[var(--lp-text-muted)]">
                      {plan.id === "trial" ? `/ ${plan.plan_length_days} days` : "/ month"}
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
                <Link
                  href={getPlanHref(plan.id)}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--lp-border-hairline)] bg-[var(--lp-ice)] px-4 py-2 text-xs font-medium text-[#08090C] transition-opacity hover:opacity-90"
                >
                  {plan.id === "trial"
                    ? isSignedIn
                      ? "Go to dashboard"
                      : "Start free trial"
                    : isSignedIn
                      ? `Choose ${plan.name}`
                      : `Get ${plan.name}`}
                </Link>
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
  );
}
