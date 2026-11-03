import { redirect } from "next/navigation";

// Redirects legacy /app/onboarding route to the dedicated /onboarding wizard
export default function LegacyOnboardingPage() {
  redirect("/onboarding");
}
