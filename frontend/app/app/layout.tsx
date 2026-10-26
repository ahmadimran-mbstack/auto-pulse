import * as React from "react";
import { auth } from "@/lib/auth/server";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { AppQueryProvider } from "@/components/providers/query-provider";
import { UserProvider, type AppUser } from "@/components/providers/user-provider";

// Shell layout wrapping all /app views with fixed 256px sidebar and 56px header
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = await auth.getSession();
  const user: AppUser = session?.user
    ? { id: session.user.id, name: session.user.name, email: session.user.email }
    : { id: "anonymous", name: "User", email: "user@example.com" };

  return (
    <AppQueryProvider>
      <UserProvider initialUser={user}>
        <div className="min-h-screen bg-background flex">
          {/* Fixed 256px sidebar on desktop (1024px and wider) */}
          <div className="hidden lg:block w-64 shrink-0">
            <AppSidebar user={user} className="fixed inset-y-0 left-0 w-64" />
          </div>

          {/* Main content column with 56px top header */}
          <div className="flex-1 flex flex-col min-w-0">
            <SiteHeader />
            <main className="flex-1 w-full bg-background">
              {children}
            </main>
          </div>
        </div>
      </UserProvider>
    </AppQueryProvider>
  );
}
