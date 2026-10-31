import * as React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
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
  let session = null;
  try {
    const res = await auth.getSession();
    session = res?.data;
  } catch (err) {
    // Session retrieval failed or token expired
  }

  // Any request to an authenticated dashboard route without a valid session MUST redirect to login
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const user: AppUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };

  const cookieStore = await cookies();
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


