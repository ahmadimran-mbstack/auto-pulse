"use client";

import { Check, Lock } from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { PlanCards } from "@/components/app/PlanCards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  const { data: ent, isLoading } = useEntitlements(user.id);

  const dateLabel =
    ent?.plan_id === "trial"
      ? ent.trial_ends_at
        ? `Trial ends ${new Date(ent.trial_ends_at).toLocaleDateString()}`
        : "Trial clock starts after setup"
      : ent?.current_period_end
      ? `Renews ${new Date(ent.current_period_end).toLocaleDateString()}`
      : "Active";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Plan & Billing"
        description="Manage your AutoPulse plan, monthly usage, and unlocked features."
      />

      {isLoading || !ent ? (
        <Card className="h-44 animate-pulse bg-muted/40" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{ent.plan_name}</CardTitle>
                  <CardDescription>{dateLabel}</CardDescription>
                </div>
                <Badge variant={ent.status === "expired" ? "destructive" : "secondary"}>
                  {ent.status}
                </Badge>
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
                  Slack approvals {!ent.features.approval_slack && "(Pro)"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {ent.features.docs_token_limit === null || ent.features.docs_token_limit > 0 ? (
                  <Check className="size-3.5 text-primary shrink-0" />
                ) : (
                  <Lock className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={
                    ent.features.docs_token_limit === null || ent.features.docs_token_limit > 0
                      ? ""
                      : "text-muted-foreground"
                  }
                >
                  Business documents{" "}
                  {ent.features.docs_token_limit === 0
                    ? "(Pro)"
                    : ent.features.docs_token_limit !== null
                    ? `(${ent.features.docs_token_limit.toLocaleString()} tokens)`
                    : "(Unlimited)"}
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
              <div className="flex items-center gap-2">
                <Check className="size-3.5 text-primary shrink-0" />
                <span>
                  Posting days: {ent.limits.max_post_days_per_week ?? 7} days/week
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Available plans</h2>
        <PlanCards currentPlanId={ent?.plan_id} excludeTrial />
      </div>
    </div>
  );
}
