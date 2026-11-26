"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiClientError } from "@/lib/api";
import { usePublicPlans } from "@/lib/queries";
import { PlanCards } from "@/components/app/PlanCards";
import type { PlanId } from "@/types/plans";

interface UpgradeDialogProps {
  error: ApiClientError | null;
  currentPlanId?: PlanId;
  onClose: () => void;
}

const UPGRADE_DIALOG_CODES = new Set([
  "monthly_quota_reached",
  "feature_locked",
  "trial_expired",
  "subscription_expired",
]);

export function UpgradeDialog({ error, currentPlanId, onClose }: UpgradeDialogProps) {
  const { data: publicPlans } = usePublicPlans();
  if (!error) return null;

  const code = error.code;

  // 1. Backstop / daily spend limit: strictly plain message, no numbers, no costs, no internal words
  if (code === "failed_run_backstop" || code === "daily_spend_limit") {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily limit reached</DialogTitle>
            <DialogDescription>We cannot run more today. Try again tomorrow.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // 2. Daily limit reached: show upgrade link ONLY if a higher plan has a higher daily limit
  if (code === "daily_limit_reached") {
    const currentDaily =
      publicPlans?.plans.find((p) => p.id === currentPlanId)?.limits.playground_runs_per_day ?? 0;
    const hasHigherDaily = Boolean(
      publicPlans?.plans.some(
        (p) =>
          p.id !== currentPlanId &&
          (p.limits.playground_runs_per_day === null ||
            p.limits.playground_runs_per_day > (currentDaily ?? 0))
      )
    );
    const canUpgradeForDaily = currentPlanId !== "internal" && (publicPlans ? hasHigherDaily : true);
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily limit reached</DialogTitle>
            <DialogDescription>
              You have used today&apos;s runs. Try again tomorrow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {canUpgradeForDaily && (
              <Button asChild onClick={onClose}>
                <Link href="/app/billing">Upgrade plan</Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // 3. Upgrade dialog with plan cards
  if (UPGRADE_DIALOG_CODES.has(code)) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upgrade your plan</DialogTitle>
            <DialogDescription>{error.message}</DialogDescription>
          </DialogHeader>
          <PlanCards
            currentPlanId={currentPlanId}
            highlightPlanId={error.upgrade_to}
            excludeTrial
          />
        </DialogContent>
      </Dialog>
    );
  }

  // 4. Fallback friendly dialog for any other 403
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Action unavailable</DialogTitle>
          <DialogDescription>{error.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
