"use client";

import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useAppSidebarState } from "@/components/providers/sidebar-provider";
import type { AppUser } from "@/components/providers/user-provider";

export function AppShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const { open, isReady } = useAppSidebarState();

  return (
    <div
      data-sidebar-ready={isReady ? "true" : "false"}
      data-sidebar-state={open ? "open" : "closed"}
      className="app-shell-grid min-h-screen bg-background w-full max-w-full overflow-x-hidden"
    >
      {/* Desktop Persistent Sidebar Column: GPU translated with synchronized grid width */}
      <div
        className="app-desktop-sidebar hidden lg:block"
        inert={!open ? true : undefined}
        aria-hidden={!open}
      >
        <div className="w-64 h-full overflow-hidden select-none">
          <AppSidebar user={user} className="w-64 h-screen sticky top-0" />
        </div>
      </div>

      {/* Main content column with 56px top header */}
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden">
        <SiteHeader />
        <main className="flex-1 w-full min-w-0 max-w-full bg-background overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

