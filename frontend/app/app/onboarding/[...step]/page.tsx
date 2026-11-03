import { redirect } from "next/navigation";

// Redirects legacy step routes like /app/onboarding/1 to the dedicated /onboarding wizard
export default function LegacyOnboardingStepPage() {
  redirect("/onboarding");
}

