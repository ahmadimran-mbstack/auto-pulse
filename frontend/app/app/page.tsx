import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppDashboardClient } from "./components/AppDashboardClient";
import { env } from "@/lib/env";

// Server components reading session data must be dynamic
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const cookieStore = await cookies();
  const isOtpPending = cookieStore.get("autopulse_otp_pending")?.value === "true";

  // Ensure user has verified their OTP before gaining access to the dashboard
  if (isOtpPending || !session.user.emailVerified) {
    const otpType = !session.user.emailVerified ? "email-verification" : "sign-in";
    redirect(
      `/auth/verify-otp?email=${encodeURIComponent(session.user.email)}&type=${otpType}`
    );
  }

  const user = session.user;
  const apiUrl = env.apiUrl;

  return <AppDashboardClient user={user} apiUrl={apiUrl} />;
}
