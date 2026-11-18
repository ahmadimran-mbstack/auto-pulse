import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { AppDashboardClient } from "./components/AppDashboardClient";
import { env } from "@/lib/env";

// Server components reading session data must be dynamic
export const dynamic = "force-dynamic";

export default async function AppPage() {
  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch {
    // Session retrieval failed
  }

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  // Redirect unverified users to sign-in so they cannot bypass email verification
  if (!session.user.emailVerified) {
    redirect("/auth/sign-in");
  }

  const user = session.user;
  const apiUrl = env.apiUrl;

  return <AppDashboardClient user={user} apiUrl={apiUrl} />;
}
