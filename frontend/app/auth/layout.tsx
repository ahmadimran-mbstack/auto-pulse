import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Force dynamic rendering so session state is always evaluated fresh
export const dynamic = "force-dynamic";

interface AuthLayoutProps {
  children: React.ReactNode;
}

// Layout wrapper for all /auth/* pages
// Prevents authenticated and verified users from visiting auth screens (/auth/sign-in, /auth/sign-up, etc.)
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export default async function AuthLayout({ children }: AuthLayoutProps) {
  const { data: session } = await auth.getSession();
  const cookieStore = await cookies();
  const isOtpPending = cookieStore.get("autopulse_otp_pending")?.value === "true";

  // If user is already authenticated and email is verified, and not awaiting OTP verification,
  // redirect them to the dashboard
  if (session?.user && session.user.emailVerified && !isOtpPending) {
    redirect("/app");
  }

  return <>{children}</>;
}
