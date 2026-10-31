"use client";

import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useAppSidebarState } from "@/components/providers/sidebar-provider";
import type { AppUser } from "@/components/providers/user-provider";
import { clearClientState } from "@/lib/queries";

export function AppShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const { open, isReady } = useAppSidebarState();

  React.useEffect(() => {
    // 1. Detect if page is restored from browser back/forward cache (bfcache)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Force full reload so server layout re-verifies session
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    // 2. Synchronize sign-out across multiple open browser tabs
    const authChannel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("autopulse-auth")
        : null;

    const handleBroadcast = (event: MessageEvent) => {
      if (event.data === "logout") {
        clearClientState();
        window.location.replace("/auth/sign-in");
      }
    };
    authChannel?.addEventListener("message", handleBroadcast);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "autopulse_logout_event") {
        clearClientState();
        window.location.replace("/auth/sign-in");
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      authChannel?.removeEventListener("message", handleBroadcast);
      authChannel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return (
    <div
      data-sidebar-ready={isReady ? "true" : "false"}
      data-sidebar-state={open ? "open" : "closed"}
      className="app-shell flex min-h-screen bg-background w-full max-w-full"
    >
      {/* Desktop Persistent Fixed Sidebar: Fixed to viewport (100dvh) */}
      <div
        className="app-desktop-sidebar hidden lg:flex fixed top-0 bottom-0 left-0 z-30 w-64 h-[100dvh] flex-col bg-sidebar border-r border-sidebar-border select-none"
        inert={!open ? true : undefined}
        aria-hidden={!open}
      >
        <AppSidebar user={user} className="w-full h-full border-r-0" />
      </div>

      {/* Desktop Spacer in document flow: keeps main content from hiding underneath */}
      <div
        className="app-desktop-sidebar-spacer hidden lg:block shrink-0 pointer-events-none"
        aria-hidden="true"
      />

      {/* Main content column with 56px top header */}
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full">
        <SiteHeader />
        <main className="flex-1 w-full min-w-0 max-w-full bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}

