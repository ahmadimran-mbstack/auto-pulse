import type { PublicPlan } from "@/types/plans";

export const DOWNGRADE_TOOLTIP = "You can only upgrade from your current plan";

export function getPlanRankUsd(planId: string | undefined, plans?: PublicPlan[]): number {
  if (!planId || planId === "trial") return 0;
  const plan = plans?.find((p) => p.id === planId);
  if (!plan || plan.is_system) return 0;
  return Number(plan.monthly_price_usd ?? 0);
}

export function isPlanDowngrade({
  targetPlanId,
  currentPlanId,
  currentStatus,
  plans,
}: {
  targetPlanId: string;
  currentPlanId?: string;
  currentStatus?: string;
  plans?: PublicPlan[];
}): boolean {
  if (!currentPlanId || currentPlanId === "trial" || currentStatus !== "active") {
    return false;
  }
  const currentRank = getPlanRankUsd(currentPlanId, plans);
  if (currentRank <= 0) return false;
  const targetRank = getPlanRankUsd(targetPlanId, plans);
  return targetRank < currentRank;
}
