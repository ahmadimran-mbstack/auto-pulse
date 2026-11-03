import * as React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import {
  verifyOnboardingCookie,
  ONBOARDING_COMPLETED_COOKIE,
} from "@/lib/onboarding-cookie";
import { AppQueryProvider } from "@/components/providers/query-provider";
import { OnboardingHeader } from "./components/OnboardingHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Standalone layout for the onboarding wizard
// Ensures users cannot access onboarding without authenticating,
// and redirects completed users straight to the active dashboard.
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isSignedOut = cookieStore.get("autopulse_signed_out")?.value === "true";

  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch (err) {
    // Session check failed or expired
  }

  // Guard 1: Unauthenticated visitors must sign in first
  if (isSignedOut || !session?.user) {
    redirect("/auth/sign-in");
  }

  // Guard 2: Users who already finished onboarding must never see it again
  const completedCookie = cookieStore.get(ONBOARDING_COMPLETED_COOKIE)?.value;
  if (verifyOnboardingCookie(session.user.id, completedCookie)) {
    redirect("/app");
  }

  return (
    <AppQueryProvider>
      <div className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-background text-foreground">
        {/* Top bar with AutoPulse logo and Sign out button */}
        <OnboardingHeader />

        {/* Centered single column for onboarding steps (approx 640px wide) */}
        <main className="flex-1 w-full max-w-[640px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {children}
        </main>
      </div>
    </AppQueryProvider>
  );
}

