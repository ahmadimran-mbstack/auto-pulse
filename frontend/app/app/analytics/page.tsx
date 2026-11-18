import { Suspense } from "react";
import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { AnalyticsClient } from "./AnalyticsClient";
import { AnalyticsSkeleton } from "@/components/app/AnalyticsSkeleton";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  // Redirect unverified users to sign-in so they cannot bypass email verification
  if (!session.user.emailVerified) {
    redirect("/auth/sign-in");
  }

  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };

  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsClient user={user} />
    </Suspense>
  );
}

