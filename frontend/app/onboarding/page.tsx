import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Root onboarding entry point: forwards to the application onboarding wizard
export default function OnboardingRootPage() {
  redirect("/app/onboarding");
}

