import type { Metadata, Viewport } from "next";
import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthToaster } from "./components/AuthToaster";

// Set mobile browser theme color and dark color scheme on the server
export const viewport: Viewport = {
  themeColor: "#08090C",
  colorScheme: "dark",
};

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
export const revalidate = 0;

interface AuthLayoutProps {
  children: React.ReactNode;
}

// Layout wrapper for all /auth/* pages
// Prevents authenticated and verified users from visiting auth screens
export default async function AuthLayout({ children }: AuthLayoutProps) {
  const cookieStore = await cookies();
  const isSignedOut = cookieStore.get("autopulse_signed_out")?.value === "true";

  // If the user has explicitly signed out, allow auth screens to render unconditionally in dark mode
  if (isSignedOut) {
    return (
      <div className="dark force-dark min-h-svh bg-[var(--lp-bg)] text-[var(--lp-text-body)] antialiased">
        <AuthToaster />
        {children}
      </div>
    );
  }

  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch (err) {
    // Gracefully handle session retrieval errors in layout (e.g. unauthenticated or cookie restrictions)
  }

  // If user is already authenticated and email is verified,
  // redirect them to dashboard (which automatically routes to /onboarding if unfinished)
  if (session?.user && session.user.emailVerified) {
    redirect("/app");
  }

  // Wrap all auth routes in forced-dark container on the server so there is no light flash
  return (
    <div className="dark force-dark min-h-svh bg-[var(--lp-bg)] text-[var(--lp-text-body)] antialiased">
      <AuthToaster />
      {children}
    </div>
  );
}
