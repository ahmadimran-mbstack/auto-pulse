"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  FileTextIcon,
  Share2Icon,
  SettingsIcon,
  ActivityIcon,
} from "lucide-react";

import { NavUser, type NavUserData } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  prefetchDashboard,
  prefetchPosts,
  prefetchConnections,
  prefetchProfile,
} from "@/lib/queries";

const navItems = [
  {
    title: "Overview",
    url: "/app",
    icon: LayoutDashboardIcon,
    exact: true,
  },
  {
    title: "Posts",
    url: "/app/posts",
    icon: FileTextIcon,
    exact: false,
  },
  {
    title: "Connections",
    url: "/app/connections",
    icon: Share2Icon,
    exact: false,
  },
  {
    title: "Settings",
    url: "/app/settings",
    icon: SettingsIcon,
    exact: false,
  },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: NavUserData & { id?: string };
}

export function AppSidebar({
  user = { name: "User", email: "user@example.com" },
  className,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();

  // Prefetches route query cache on hover or keyboard focus
  const handlePrefetch = (url: string) => {
    const userId = user?.id || "anonymous";
    if (url === "/app") prefetchDashboard(userId);
    else if (url === "/app/posts") prefetchPosts(userId);
    else if (url === "/app/connections") prefetchConnections(userId);
    else if (url === "/app/settings") prefetchProfile(userId);
  };

  return (
    <Sidebar
      variant="sidebar"
      collapsible="offcanvas"
      className={cn("w-58 border-r border-sidebar-border bg-sidebar", className)}
      {...props}
    >
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3.5">
        <Link href="/app" className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ActivityIcon className="size-4" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-base font-semibold text-foreground tracking-tight">
              AutoPulse
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarMenu className="gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.url
              : pathname === item.url || pathname?.startsWith(`${item.url}/`);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className={cn(
                    "relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors duration-120",
                    isActive
                      ? "border-l-2 border-primary bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Link
                    href={item.url}
                    onMouseEnter={() => handlePrefetch(item.url)}
                    onFocus={() => handlePrefetch(item.url)}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
