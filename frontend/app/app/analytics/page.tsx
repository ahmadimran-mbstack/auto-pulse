import { Suspense } from "react";
import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AnalyticsClient } from "./AnalyticsClient";
import { AnalyticsSkeleton } from "@/components/app/AnalyticsSkeleton";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const cookieStore = await cookies();
  const isOtpPending = cookieStore.get("autopulse_otp_pending")?.value === "true";

  if (isOtpPending || !session.user.emailVerified) {
    const otpType = !session.user.emailVerified ? "email-verification" : "sign-in";
    redirect(
      `/auth/verify-otp?email=${encodeURIComponent(session.user.email)}&type=${otpType}`
    );
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

