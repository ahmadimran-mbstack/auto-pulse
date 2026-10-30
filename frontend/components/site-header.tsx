"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronsUpDown, Plus, PanelLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppSidebar } from "@/components/app-sidebar";
import { useUser } from "@/components/providers/user-provider";
import { useAppSidebarState } from "@/components/providers/sidebar-provider";
import { useDashboardQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

const statusFilterOptions = [
  { value: "all", label: "All posts" },
  { value: "needs_approval", label: "Needs approval" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "problems", label: "Problems" },
];

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status") || "all";
  const { user } = useUser();
  const { open, mobileOpen, setMobileOpen, toggle } = useAppSidebarState();

  // Retrieve dashboard data to check for pending approvals
  const { data: dashboardData } = useDashboardQuery(user.id);
  const awaitingCount = dashboardData?.stats?.awaiting_approval ?? 0;

  // Derive human-readable page title based on path
  let pageTitle = "Overview";
  if (pathname.startsWith("/app/posts")) {
    pageTitle = "Posts";
  } else if (pathname.startsWith("/app/playground")) {
    pageTitle = "Post to LinkedIn";
  } else if (pathname.startsWith("/app/connections")) {
    pageTitle = "Connections";
  } else if (pathname.startsWith("/app/settings")) {
    pageTitle = "Settings";
  }

  const activeOption =
    statusFilterOptions.find((opt) => opt.value === currentStatus) ||
    statusFilterOptions[0];

  const handleSelectStatus = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val === "all") {
      params.delete("status");
    } else {
      params.set("status", val);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:px-6 sticky top-0 z-20 w-full max-w-full overflow-hidden">
      {/* Left: Sidebar slide toggle & Status filter dropdown */}
      <div className="flex items-center gap-2">
        {/* Sidebar slide toggle button for desktop & mobile */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Toggle navigation sidebar"
              aria-expanded={mobileOpen || open}
              onClick={toggle}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <PanelLeft className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle sidebar (Ctrl+B)</TooltipContent>
        </Tooltip>

        {/* Mobile sidebar overlay drawer for screens < 1024px */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-64 border-r border-border bg-sidebar">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>
            <AppSidebar
              user={user}
              className="w-full h-full border-r-0"
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Status filter dropdown: All posts, Needs approval, Scheduled, Published, Problems */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <span>{activeOption.label}</span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44 p-1">
            {statusFilterOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => handleSelectStatus(opt.value)}
                className={cn(
                  "cursor-pointer text-sm rounded-md px-2.5 py-1.5",
                  currentStatus === opt.value
                    ? "bg-accent font-medium text-foreground"
                    : "text-foreground hover:bg-accent/60"
                )}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center: Page title */}
      <div className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground pointer-events-none hidden sm:block">
        {pageTitle}
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-2">
        {awaitingCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSelectStatus("needs_approval")}
            className="h-8 gap-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            <span className="size-1.5 rounded-full bg-status-info-fg" />
            <span>Review draft</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-8 gap-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Link href="/app/playground">
            <Plus className="size-4" />
            <span>Generate draft</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
