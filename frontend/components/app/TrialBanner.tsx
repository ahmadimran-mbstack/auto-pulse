"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/lib/queries";

export function TrialBanner({ userId }: { userId: string }) {
  const { data: ent } = useEntitlements(userId);

  if (!ent || ent.plan_id !== "trial" || ent.status !== "trialing") {
    return null;
  }

  let daysText = "3-day free trial";
  if (ent.trial_ends_at) {
    const msLeft = new Date(ent.trial_ends_at).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    daysText = daysLeft === 1 ? "1 day left in trial" : `${daysLeft} days left in trial`;
  }

  const schedLeft = Math.max(0, (ent.usage.scheduled_limit ?? 0) - ent.usage.scheduled_used);
  const pgLeft = Math.max(0, (ent.usage.playground_limit ?? 0) - ent.usage.playground_used);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs border-b border-border bg-muted/40">
      <div className="flex items-center gap-2 text-foreground">
        <Sparkles className="size-3.5 text-primary shrink-0" />
        <span>
          <strong className="font-medium">{daysText}</strong> — {schedLeft} scheduled posts and{" "}
          {pgLeft} Playground runs left.
        </span>
      </div>
      <Button asChild size="sm" variant="default" className="h-7 text-xs">
        <Link href="/app/billing">Choose a plan</Link>
      </Button>
    </div>
  );
}
