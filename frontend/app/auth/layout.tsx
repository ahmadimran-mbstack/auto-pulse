import type { Metadata, Viewport } from "next";
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
  // Wrap all auth routes in forced-dark container on the server so there is no light flash
  return (
    <div className="dark force-dark min-h-svh bg-[var(--lp-bg)] text-[var(--lp-text-body)] antialiased">
      <AuthToaster />
      {children}
    </div>
  );
}
