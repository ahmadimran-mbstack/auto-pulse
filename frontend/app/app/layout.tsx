import * as React from "react";
import { auth } from "@/lib/auth/server";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { AppQueryProvider } from "@/components/providers/query-provider";
import { UserProvider, type AppUser } from "@/components/providers/user-provider";

// Server shell layout wrapping all /app views with providers, AppSidebar, and SiteHeader
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
        <SidebarProvider
          style={
            {
              "--sidebar-width": "232px",
            } as React.CSSProperties
          }
          className="min-h-screen bg-background"
        >
          <AppSidebar user={user} />
          <SidebarInset className="bg-background flex flex-col min-w-0">
            <SiteHeader />
            <div className="flex-1 w-full page-container mx-auto px-4 md:px-6 py-4 md:py-6">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </UserProvider>
    </AppQueryProvider>
  );
}
