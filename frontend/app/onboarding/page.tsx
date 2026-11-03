"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/api";
import { OnboardingSkeleton } from "./components/OnboardingShell";
import { ErrorState } from "@/components/app/ErrorState";
import { Card } from "@/components/ui/card";

// Mapping from numerical backend step to dedicated onboarding route path
const STEP_ROUTES: Record<number, string> = {
  0: "/onboarding/topics",
  1: "/onboarding/voice",
  2: "/onboarding/brand",
  3: "/onboarding/approvals",
  4: "/onboarding/schedule",
};

// Entry point for /onboarding that resumes at the user's next unfinished step
export default function OnboardingIndexPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkResumeStep() {
      try {
        const profile = await getProfile();
        if (!isMounted) return;

        // If user already finished onboarding, send them straight to dashboard
        if (profile.onboarding_complete) {
          router.replace("/app");
          return;
        }

        // Resume rule: navigate to the route corresponding to the user's current step
        const savedStep = profile.onboarding_step ?? 0;
        const targetRoute = STEP_ROUTES[savedStep] || "/onboarding/topics";
        router.replace(targetRoute);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load profile";
        setError(msg);
      }
    }

    checkResumeStep();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-foreground">
        <Card className="p-6 max-w-md w-full bg-card border-border">
          <ErrorState
            message={error}
            onRetry={() => window.location.reload()}
          />
        </Card>
      </div>
    );
  }

  return <OnboardingSkeleton />;
}
