"use client";

import React from "react";
import Link from "next/link";
import { Check, ChevronDown, Info, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PublicPlan, PublicPlansResponse } from "@/types/plans";
import { ScrollReveal } from "./scroll-reveal";
import { useSessionStatus } from "./use-session-status";

type CellValue = boolean | string;

interface CompareRow {
  label: string;
  tooltip?: string;
  values: CellValue[];
}

interface CompareSection {
  id: string;
  title: string;
  rows: CompareRow[];
}

function buildKeyFeatures(plan: PublicPlan): string[] {
  const schedLabel = `${plan.limits.scheduled_posts} AI posts${plan.id === "trial" ? " total" : " per month"
    }`;
  const daysLabel = `Up to ${plan.limits.max_post_days_per_week} posting days per week`;
  const pgLabel = `${plan.limits.playground_runs} Playground runs${plan.id === "trial" ? " total" : " per month"
    } (${plan.limits.playground_runs_per_day}/day)`;

  if (plan.id === "trial") {
    return [
      schedLabel,
      pgLabel,
      daysLabel,
      "1 LinkedIn profile",
      "Approval by email before every post",
    ];
  }
  if (plan.id === "starter") {
    return [
      schedLabel,
      pgLabel,
      daysLabel,
      "Basic analytics (summary and posts over time)",
      "Email support",
    ];
  }
  if (plan.id === "pro") {
    return [
      "Everything in Starter, plus:",
      schedLabel,
      "Approval in Slack and email",
      `Up to ${plan.features.docs_token_limit.toLocaleString()} business document tokens`,
      "Full analytics (funnel, hooks, topics, turnaround)",
    ];
  }
  return [
    "Everything in Pro, plus:",
    schedLabel,
    `${pgLabel}`,
    `Up to ${plan.features.docs_token_limit.toLocaleString()} business document tokens`,
    `Support: ${plan.features.support}`,
  ];
}

function formatAnalyticsLabel(level: PublicPlan["features"]["analytics_level"]) {
  if (level === "none") return false;
  if (level === "basic") return "Basic";
  return "Full";
}

function renderCell(val: CellValue) {
  if (val === true) {
    return (
      <span className="inline-flex items-center justify-center">
        <Check className="w-4 h-4 text-[var(--lp-ice)]" aria-hidden="true" />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (val === false) {
    return (
      <span className="inline-flex items-center justify-center">
        <Minus className="w-4 h-4 text-[var(--lp-text-muted)]" aria-hidden="true" />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span className="text-xs text-[var(--lp-text-heading)] tabular-nums">{val}</span>;
}

export function PricingPageClient({ data }: { data: PublicPlansResponse }) {
  const [interval, setInterval] = React.useState<"monthly" | "annual">("monthly");
  const { isLoaded, isSignedIn } = useSessionStatus();
  const ctaHref = isLoaded && isSignedIn ? "/app/billing" : "/auth/sign-up";

  const plans = data.plans;
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    glance: true,
    posting: true,
    writing: true,
    approvals: true,
    analytics: true,
    support: true,
    coming: true,
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sections: CompareSection[] = [
    {
      id: "glance",
      title: "Plans at a glance",
      rows: [
        {
          label: "Price per month (USD)",
          values: plans.map((p) => (p.monthly_price_usd === 0 ? "Free" : `$${p.monthly_price_usd.toFixed(2)}`)),
        },
        {
          label: "About in PKR",
          values: plans.map((p) => `Rs ${p.monthly_price_pkr_approx.toLocaleString()}`),
        },
        {
          label: "Price per year, 5% off",
          values: plans.map((p) => (p.annual_price_usd !== null ? `$${p.annual_price_usd.toFixed(2)}` : "-")),
        },
        {
          label: "Plan length",
          values: plans.map((p) => `${p.plan_length_days} days`),
        },
      ],
    },
    {
      id: "posting",
      title: "Posting",
      rows: [
        {
          label: "AI posts per month",
          values: plans.map((p) =>
            p.id === "trial" ? `${p.limits.scheduled_posts} in total` : `${p.limits.scheduled_posts}`
          ),
        },
        {
          label: "Posting days per week",
          values: plans.map((p) => `up to ${p.limits.max_post_days_per_week}`),
        },
        {
          label: "Playground runs per month",
          values: plans.map((p) =>
            p.id === "trial" ? `${p.limits.playground_runs} in total` : `${p.limits.playground_runs}`
          ),
        },
        {
          label: "Playground runs per day",
          values: plans.map((p) => `${p.limits.playground_runs_per_day}`),
        },
        {
          label: "LinkedIn profile",
          values: plans.map((p) => `${p.limits.linkedin_profiles}`),
        },
      ],
    },
    {
      id: "writing",
      title: "AI writing",
      rows: [
        {
          label: "Topic finder with web search and repeat protection",
          values: plans.map(() => true),
        },
        {
          label: "Hook strategist",
          values: plans.map(() => true),
        },
        {
          label: "AI-writing checker with rewrite loop",
          values: plans.map(() => true),
        },
        {
          label: "Custom instructions",
          values: plans.map(() => true),
        },
        {
          label: "Business documents (playbooks, past posts)",
          tooltip: "roughly 3,000 / 6,000 words",
          values: plans.map((p) =>
            p.features.docs_token_limit > 0
              ? `Up to ${p.features.docs_token_limit.toLocaleString()} tokens`
              : false
          ),
        },
      ],
    },
    {
      id: "approvals",
      title: "Approvals and publishing",
      rows: [
        {
          label: "Approval by email",
          values: plans.map((p) => p.features.approval_email),
        },
        {
          label: "Approval in Slack",
          values: plans.map((p) => p.features.approval_slack),
        },
        {
          label: "Publish to LinkedIn after your approval",
          values: plans.map(() => true),
        },
        {
          label: "Duplicate-post protection",
          values: plans.map(() => true),
        },
        {
          label: "LinkedIn reconnect reminder emails",
          values: plans.map(() => true),
        },
      ],
    },
    {
      id: "analytics",
      title: "Analytics",
      rows: [
        {
          label: "Summary and posts over time",
          values: plans.map((p) => formatAnalyticsLabel(p.features.analytics_level) !== false),
        },
        {
          label: "Funnel, hook styles, topics, turnaround",
          values: plans.map((p) => p.features.analytics_level === "full"),
        },
      ],
    },
    {
      id: "support",
      title: "Support",
      rows: [
        {
          label: "Help docs",
          values: plans.map(() => true),
        },
        {
          label: "Email and tickets",
          values: plans.map((p) => p.id !== "trial"),
        },
        {
          label: "Answered first",
          values: plans.map((p) => p.features.support.toLowerCase().includes("first")),
        },
      ],
    },
    {
      id: "coming",
      title: "Coming soon",
      rows: [
        {
          label: "Instagram and Facebook",
          values: plans.map((p) => (p.id === "trial" ? "-" : "Coming soon")),
        },
      ],
    },
  ];

  return (
    <TooltipProvider>
      <div className="overflow-x-hidden">
        {/* 1. Hero + Toggle */}
        <section className="pt-32 pb-16 md:pt-40 md:pb-24">
          <div className="max-w-7xl mx-auto px-5 lg:px-8 text-center space-y-6">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--lp-ice)]">
              PRICING
            </p>
            <p className="text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-balance text-[var(--lp-text-heading)]">
              Start free. Stay consistent.
            </p>
            <p className="text-base sm:text-lg text-[var(--lp-text-muted)] max-w-2xl mx-auto text-balance">
              Start with a 3-day free trial. Every plan includes LinkedIn publishing and email approvals.
            </p>

            <div className="pt-2 flex justify-center">
              <div
                role="radiogroup"
                aria-label="Billing interval"
                className="inline-flex items-center rounded-full border border-white/10 bg-[var(--lp-navy-deep)] p-1"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={interval === "monthly"}
                  onClick={() => setInterval("monthly")}
                  className={cn(
                    "px-5 py-2 rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]",
                    interval === "monthly"
                      ? "bg-[var(--lp-ice)] text-[#08090C] font-medium"
                      : "text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)]"
                  )}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={interval === "annual"}
                  onClick={() => setInterval("annual")}
                  className={cn(
                    "px-5 py-2 rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]",
                    interval === "annual"
                      ? "bg-[var(--lp-ice)] text-[#08090C] font-medium"
                      : "text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)]"
                  )}
                >
                  Annual (5% off)
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Four Plan Cards */}
        <section className="pb-16 md:pb-24">
          <div className="max-w-7xl mx-auto px-5 lg:px-8">
            <ScrollReveal>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
                {plans.map((plan) => {
                  const isPro = plan.id === "pro";
                  const isAnnual = interval === "annual" && plan.annual_price_usd !== null;
                  const monthlyUsd = isAnnual
                    ? plan.annual_monthly_equivalent_usd
                    : plan.monthly_price_usd;
                  const monthlyPkr = isAnnual
                    ? plan.annual_monthly_equivalent_pkr_approx
                    : plan.monthly_price_pkr_approx;
                  const keyFeatures = buildKeyFeatures(plan);

                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "relative flex flex-col justify-between rounded-2xl p-6 sm:p-7 transition-all duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                        isPro
                          ? "bg-gradient-to-b from-[var(--lp-ice)]/25 via-white/10 to-white/10 p-[1px] shadow-[0_0_40px_-12px_rgba(125,211,252,0.25)]"
                          : "border border-white/10 bg-[var(--lp-navy-deep)]/70 hover:border-white/25"
                      )}
                    >
                      <div
                        className={cn(
                          "flex flex-col justify-between h-full",
                          isPro && "rounded-[15px] bg-[var(--lp-navy-deep)] p-6 sm:p-7"
                        )}
                      >
                        <div className="space-y-6">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 min-h-[24px]">
                              <h2 className="text-base font-normal text-[var(--lp-text-heading)]">
                                {plan.name}
                              </h2>
                              {isPro && (
                                <Badge
                                  variant="secondary"
                                  className="bg-[var(--lp-ice)]/15 text-[var(--lp-ice)] border border-[var(--lp-ice)]/30 text-[11px] font-normal"
                                >
                                  Best for daily posting
                                </Badge>
                              )}
                            </div>

                            <div
                              key={`${plan.id}-${interval}`}
                              className="transition-opacity duration-150 ease-out motion-reduce:transition-none"
                            >
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-5xl font-normal tracking-tight text-[var(--lp-text-heading)] tabular-nums">
                                  ${monthlyUsd === 0 ? "0" : monthlyUsd?.toFixed(2)}
                                </span>
                                <span className="text-xs text-[var(--lp-text-muted)]">
                                  {plan.id === "trial" ? `/ ${plan.plan_length_days} days` : "/ month"}
                                </span>
                              </div>
                              <p className="mt-1.5 text-xs text-[var(--lp-text-muted)] tabular-nums">
                                about Rs {monthlyPkr?.toLocaleString() ?? 0}
                              </p>
                              <p className="mt-1 text-xs text-[var(--lp-ice)] tabular-nums min-h-[16px]">
                                {isAnnual && plan.annual_price_usd !== null
                                  ? `billed $${plan.annual_price_usd.toFixed(2)} yearly`
                                  : ""}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3 pt-2 border-t border-white/10">
                            <p className="text-xs font-medium text-[var(--lp-text-heading)]">
                              Key features
                            </p>
                            <ul className="space-y-2.5 text-xs text-[var(--lp-text-muted)]">
                              {keyFeatures.map((feat, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <Check
                                    className="w-3.5 h-3.5 mt-0.5 text-[var(--lp-ice)] shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="text-[var(--lp-text-heading)]">{feat}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="pt-8 mt-6">
                          <Button
                            asChild
                            className={cn(
                              "w-full rounded-xl text-xs font-medium",
                              isPro
                                ? "bg-[var(--lp-ice)] text-[#08090C] hover:bg-[var(--lp-ice)]/90"
                                : "bg-white text-[#08090C] hover:bg-white/90"
                            )}
                          >
                            <Link href={ctaHref}>
                              {isSignedIn
                                ? "Manage plan"
                                : plan.id === "trial"
                                  ? "Start free trial"
                                  : `Choose ${plan.name}`}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* 3. Slim Included in every plan row */}
        <section className="py-10 border-y border-white/10 bg-[var(--lp-navy-deep)]/40">
          <div className="max-w-7xl mx-auto px-5 lg:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--lp-ice)] shrink-0">
              Included in every plan
            </p>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--lp-text-heading)]">
              {[
                "Topic finder with web search",
                "Hook strategist",
                "AI-writing checker",
                "Approval before every post",
                "LinkedIn publishing",
              ].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[var(--lp-ice)]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Compare Plans Table */}
        <section className="py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-5 lg:px-8 space-y-8">
            <ScrollReveal>
              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-normal tracking-tight text-balance text-[var(--lp-text-heading)]">
                  Compare plans
                </h2>
                <p className="text-sm text-[var(--lp-text-muted)]">
                  Every limit and feature across Free trial, Starter, Pro, and Business.
                </p>
              </div>
            </ScrollReveal>

            <div className="rounded-2xl border border-white/10 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="sticky top-0 z-20 bg-[var(--lp-bg)]/90 backdrop-blur-xl border-b border-white/10">
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-30 bg-[var(--lp-bg)]/95 backdrop-blur-xl p-4 sm:p-5 text-xs font-normal text-[var(--lp-text-muted)] w-64"
                    >
                      Features
                    </th>
                    {plans.map((p) => {
                      const isAnnual = interval === "annual" && p.annual_price_usd !== null;
                      const price = isAnnual ? p.annual_monthly_equivalent_usd : p.monthly_price_usd;
                      return (
                        <th key={p.id} scope="col" className="p-4 sm:p-5 text-center align-top">
                          <div className="space-y-2">
                            <div className="text-sm font-normal text-[var(--lp-text-heading)]">
                              {p.name}
                            </div>
                            <div className="text-lg font-normal text-[var(--lp-text-heading)] tabular-nums">
                              {price === 0 ? "Free" : `$${price?.toFixed(2)}/mo`}
                            </div>
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs border-white/15">
                              <Link href={ctaHref}>{isSignedIn ? "Manage" : "Start"}</Link>
                            </Button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((sec) => {
                    const isOpen = openSections[sec.id] !== false;
                    return (
                      <React.Fragment key={sec.id}>
                        <tr className="border-t border-white/10 bg-[var(--lp-navy-deep)]/60">
                          <th
                            scope="row"
                            colSpan={5}
                            className="p-0 text-left"
                          >
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() => toggleSection(sec.id)}
                              className="w-full flex items-center justify-between px-4 sm:px-5 py-3 text-xs uppercase tracking-[0.15em] text-[var(--lp-ice)] hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]"
                            >
                              <span>{sec.title}</span>
                              <ChevronDown
                                className={cn(
                                  "w-4 h-4 transition-transform duration-200 motion-reduce:transition-none",
                                  isOpen ? "rotate-180" : ""
                                )}
                                aria-hidden="true"
                              />
                            </button>
                          </th>
                        </tr>
                        {isOpen &&
                          sec.rows.map((row) => (
                            <tr
                              key={row.label}
                              className="border-t border-white/10 hover:bg-white/[0.03] transition-colors"
                            >
                              <th
                                scope="row"
                                className="sticky left-0 z-10 bg-[var(--lp-bg)] px-4 sm:px-5 py-3.5 text-xs font-normal text-[var(--lp-text-heading)]"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <span>{row.label}</span>
                                  {row.tooltip && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          aria-label={row.tooltip}
                                          className="text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)] rounded"
                                        >
                                          <Info className="w-3.5 h-3.5" aria-hidden="true" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>{row.tooltip}</TooltipContent>
                                    </Tooltip>
                                  )}
                                </span>
                              </th>
                              {row.values.map((val, idx) => (
                                <td key={idx} className="px-4 sm:px-5 py-3.5 text-center">
                                  {renderCell(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}
