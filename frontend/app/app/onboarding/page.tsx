"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/api";
import { OnboardingSkeleton } from "./components/OnboardingShell";

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
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper text-ink">
        <div className="p-6 rounded-[12px] bg-surface border border-line max-w-md w-full text-left space-y-4">
          <h2 className="text-xl font-geist font-normal text-ink">Connection issue</h2>
          <p className="text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <OnboardingSkeleton />;
}
