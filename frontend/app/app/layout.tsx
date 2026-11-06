import * as React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import {
  verifyOnboardingCookie,
  ONBOARDING_COMPLETED_COOKIE,
} from "@/lib/onboarding-cookie";
import { AppQueryProvider } from "@/components/providers/query-provider";
import { UserProvider, type AppUser } from "@/components/providers/user-provider";
import { AppSidebarProvider } from "@/components/providers/sidebar-provider";
import { AppShell } from "@/components/app/app-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Shell layout wrapping all /app views with synchronized sliding sidebar and 56px header
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isSignedOut = cookieStore.get("autopulse_signed_out")?.value === "true";

  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch (err) {
    // Session retrieval failed or token expired
  }

  // Any request to an authenticated dashboard route without a valid session or while marked signed-out MUST redirect to login
  if (isSignedOut || !session?.user) {
    redirect("/auth/sign-in");
  }

  // Guard: Users who have not finished onboarding are redirected to /onboarding
  // Check the signed httpOnly cookie first to avoid hitting the database on every visit
  const completedCookie = cookieStore.get(ONBOARDING_COMPLETED_COOKIE)?.value;
  const isCompletedByCookie = verifyOnboardingCookie(session.user.id, completedCookie);

  if (!isCompletedByCookie) {
    // If the cookie is not present, check profile via backend to handle users switching devices
    let backendComplete: boolean | null = null;
    const token = (session as any)?.session?.token;

    if (token) {
      try {
        const backendBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const profileRes = await fetch(`${backendBase.replace(/\/$/, "")}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          backendComplete = Boolean(profileData?.onboarding_complete);
        }
      } catch {
        // Backend lookup failed
      }
    }

    // Only redirect if backend definitively reported that onboarding is NOT complete.
    // If the backend call failed or returned 401 (e.g. server-side session token isn't a JWT),
    // do not blindly redirect to /onboarding; allow AppDashboardClient to check using the
    // client-side JWT to prevent circular redirect loops.
    if (backendComplete === false) {
      redirect("/onboarding");
    }
  }

  const user: AppUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };

  const initialOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <AppQueryProvider>
      <UserProvider initialUser={user}>
        <AppSidebarProvider initialOpen={initialOpen}>
          <AppShell user={user}>
            {children}
          </AppShell>
        </AppSidebarProvider>
      </UserProvider>
    </AppQueryProvider>
  );
}
