"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Share2,
  Settings,
  ChevronDown,
  Search,
  Activity,
  User,
  Sliders,
  Palette,
  Calendar,
  Shield,
  PenSquare,
  BarChart3,
} from "lucide-react";

import { useDashboardQuery, prefetchDashboard, prefetchPosts, prefetchConnections, prefetchProfile, prefetchAnalytics } from "@/lib/queries";
import { SidebarNoticeCard } from "@/components/app/sidebar-notice-card";
import { SidebarUserRow } from "@/components/app/sidebar-user-row";
import { CommandPalette } from "@/components/app/command-palette";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
  };
  className?: string;
  onNavigate?: () => void;
}

export function AppSidebar({ user, className, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "profile";

  const [commandOpen, setCommandOpen] = React.useState(false);
  const isSettingsActive = pathname.startsWith("/app/settings");
  const [userSettingsExpanded, setUserSettingsExpanded] = React.useState<boolean | null>(null);
  const settingsExpanded = userSettingsExpanded ?? isSettingsActive;

  // Fetch dashboard connections to pass to notice card
  const { data: dashboardData } = useDashboardQuery(user.id);

  // Global keyboard shortcut for 'F' to open command palette
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (!isInput && (e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prefetch cache on hover or focus
  const handlePrefetch = (url: string) => {
    if (url === "/app") prefetchDashboard(user.id);
    else if (url === "/app/analytics") prefetchAnalytics(user.id);
    else if (url === "/app/posts") prefetchPosts(user.id);
    else if (url === "/app/connections") prefetchConnections(user.id);
    else if (url === "/app/settings") prefetchProfile(user.id);
  };

  const navItems = [
    { title: "Overview", url: "/app", icon: LayoutDashboard, exact: true },
    { title: "Analytics", url: "/app/analytics", icon: BarChart3, exact: false },
    { title: "Posts", url: "/app/posts", icon: FileText, exact: false },
    { title: "Playground", url: "/app/playground", icon: PenSquare, exact: false },
    { title: "Connections", url: "/app/connections", icon: Share2, exact: false },
  ];


  const settingsSubItems = [
    { title: "Profile", tab: "profile", icon: User },
    { title: "Content", tab: "content", icon: Sliders },
    { title: "Brand", tab: "brand", icon: Palette },
    { title: "Schedule", tab: "schedule", icon: Calendar },
    { title: "Account", tab: "account", icon: Shield },
  ];

  return (
    <>
      <aside
        className={cn(
          "w-64 flex flex-col h-full bg-sidebar select-none",
          className
        )}
      >
        {/* Top Header Block: 56px */}
        <div className="shrink-0">
          <div className="flex h-14 items-center px-4">
            <Link href="/app" className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-sm bg-foreground text-background">
                <Activity className="size-3.5 stroke-[2.5]" />
              </div>
              <span className="text-sm font-semibold text-foreground tracking-tight">
                AutoPulse
              </span>
            </Link>
          </div>

          {/* Find Box: 36px high, 8px inset from edges */}
          <div className="mx-2 mb-3">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex h-9 w-full items-center justify-between rounded-lg border border-card-border bg-card px-3 text-sm text-muted-foreground transition-[border-color] duration-200 ease-in-out hover:text-foreground hover:border-input-focus focus:outline-none focus:border-input-focus focus-visible:border-input-focus focus-visible:ring-0"
            >
              <div className="flex items-center gap-2">
                <Search className="size-4 text-muted-foreground" />
                <span className="text-sm">Find</span>
              </div>
              <kbd className="hidden sm:inline-flex size-5 items-center justify-center rounded border border-border bg-secondary text-xs font-mono text-muted-foreground">
                F
              </kbd>
            </button>
          </div>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 min-h-0 mx-2 space-y-px overflow-y-auto no-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.url
                : pathname === item.url || pathname.startsWith(`${item.url}/`);

              return (
                <Link
                  key={item.title}
                  href={item.url}
                  onClick={() => onNavigate?.()}
                  onMouseEnter={() => handlePrefetch(item.url)}
                  onFocus={() => handlePrefetch(item.url)}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-foreground font-normal"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                  <span>{item.title}</span>
                </Link>
              );
            })}

            {/* Expandable Settings Item */}
            <div>
              <div
                className={cn(
                  "flex h-9 items-center justify-between rounded-lg px-3 text-sm cursor-pointer transition-colors",
                  isSettingsActive
                    ? "bg-accent text-foreground font-normal"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                onClick={() => setUserSettingsExpanded(!settingsExpanded)}
              >
                <Link
                  href="/app/settings"
                  className="flex items-center gap-3 flex-1"
                  onClick={() => {
                    // Let row toggle expand or navigate
                    setUserSettingsExpanded(true);
                    onNavigate?.();
                  }}
                >
                  <Settings className="size-4 shrink-0" strokeWidth={1.5} />
                  <span>Settings</span>
                </Link>
                <button
                  type="button"
                  aria-label={settingsExpanded ? "Collapse settings" : "Expand settings"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserSettingsExpanded(!settingsExpanded);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-300 ease-in-out",
                      settingsExpanded && "rotate-180"
                    )}
                  />
                </button>
              </div>

              {/* Sub-items in place with smooth ease-in-out height animation */}
              <div
                className={cn(
                  "grid transition-all duration-300 ease-in-out overflow-hidden",
                  settingsExpanded
                    ? "grid-rows-[1fr] opacity-100 mt-1"
                    : "grid-rows-[0fr] opacity-0 mt-0"
                )}
              >
                <div className="min-h-0 ml-4 pl-2 space-y-px border-l border-border">
                  {settingsSubItems.map((sub) => {
                    const isSubActive = isSettingsActive && currentTab === sub.tab;
                    const SubIcon = sub.icon;
                    return (
                      <Link
                        key={sub.tab}
                        href={`/app/settings?tab=${sub.tab}`}
                        onClick={() => onNavigate?.()}
                        className={cn(
                          "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-xs transition-colors duration-200 ease-in-out",
                          isSubActive
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <SubIcon className="size-3.5 shrink-0" strokeWidth={1.5} />
                        <span>{sub.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </nav>

        {/* Pinned Bottom Notice Card and User Row */}
        <div className="shrink-0 mt-auto">
          <SidebarNoticeCard connections={dashboardData?.connections} />
          <SidebarUserRow user={user} />
        </div>
      </aside>

      {/* Command Palette Dialog */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
