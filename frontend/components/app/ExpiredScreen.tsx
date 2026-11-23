"use client";

import { AlertCircle } from "lucide-react";

import { PlanCards } from "@/components/app/PlanCards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntitlements } from "@/lib/queries";

export function ExpiredBanner({ userId }: { userId: string }) {
  const { data: ent } = useEntitlements(userId);

  if (!ent || ent.status !== "expired") {
    return null;
  }

  return (
    <div className="p-4 sm:p-6 border-b border-border bg-muted/20">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-destructive" />
            <CardTitle className="text-base">
              {ent.plan_id === "trial" ? "Your free trial has ended" : "Your plan has expired"}
            </CardTitle>
          </div>
          <CardDescription>
            Your dashboard is in read-only mode. Choose a plan below to resume generating and publishing posts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanCards currentPlanId={ent.plan_id} excludeTrial />
        </CardContent>
      </Card>
    </div>
  );
}
