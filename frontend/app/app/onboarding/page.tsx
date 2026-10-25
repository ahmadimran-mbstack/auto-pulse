"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/api";
import { OnboardingSkeleton } from "./components/OnboardingShell";
import { ErrorState } from "@/components/app/ErrorState";
import { Card } from "@/components/ui/card";

// Entry point for /app/onboarding that resumes at the user's next unfinished step
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

        // Resume rule: step after last saved step, at most 4
        const targetStep = Math.min(4, Math.max(1, (profile.onboarding_step || 0) + 1));
        router.replace(`/app/onboarding/${targetStep}`);
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <Card className="p-6 max-w-md w-full">
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
