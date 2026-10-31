import type { Metadata } from "next";
import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Metadata for authentication routes
export const metadata: Metadata = {
  title: "AutoPulse: Account verification and access",
  description: "Sign in or create your account to review daily LinkedIn drafts and manage publishing permissions.",
  openGraph: {
    title: "AutoPulse: Account verification and access",
    description: "Sign in or create your account to review daily LinkedIn drafts and manage publishing permissions.",
    type: "website",
  },
};

// Force dynamic rendering so session state is always evaluated fresh
export const dynamic = "force-dynamic";

interface AuthLayoutProps {
  children: React.ReactNode;
}

// Layout wrapper for all /auth/* pages
// Prevents authenticated and verified users from visiting auth screens
export default async function AuthLayout({ children }: AuthLayoutProps) {
  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch (err) {
    // Gracefully handle session retrieval errors in layout (e.g. unauthenticated or cookie restrictions)
  }

  const cookieStore = await cookies();
  const isOtpPending = cookieStore.get("autopulse_otp_pending")?.value === "true";

  // If user is already authenticated and email is verified, and not awaiting OTP verification,
  // redirect them to the dashboard
  if (session?.user && session.user.emailVerified && !isOtpPending) {
    redirect("/app");
  }

  return <>{children}</>;
}
