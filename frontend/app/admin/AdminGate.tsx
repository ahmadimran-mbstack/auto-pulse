"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  CreditCard,
  Layers,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import { getAdminMe } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { title: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Users", href: "/admin/users", icon: Users, exact: false },
  { title: "Payments", href: "/admin/payments", icon: Wallet, exact: false },
  { title: "Subscribers", href: "/admin/subscribers", icon: CreditCard, exact: false },
  { title: "Usage", href: "/admin/usage", icon: Activity, exact: false },
  { title: "Plans", href: "/admin/plans", icon: Layers, exact: false },
];

function AdminSidebarContent({
  email,
  pathname,
  onNavigate,
}: {
  email: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-foreground select-none">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <ShieldCheck className="size-4 text-foreground" />
        <span className="text-sm font-semibold tracking-tight">AutoPulse Admin</span>
      </div>

      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.5} />
              <span>{item.title}</span>
            </Link>
          );
        })}

        <div className="pt-3 mt-3 border-t border-sidebar-border">
          <Link
            href="/app"
            onClick={() => onNavigate?.()}
            className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4 shrink-0" strokeWidth={1.5} />
            <span>Back to app</span>
          </Link>
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2.5">
        <div className="truncate text-xs text-muted-foreground" title={email}>
          {email}
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const { isLoading, isError, data } = useQuery({
    queryKey: ["admin-me"],
    queryFn: getAdminMe,
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError || !data?.is_admin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page could not be found.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <div className="hidden lg:flex fixed top-0 bottom-0 left-0 z-30 w-64 border-r border-sidebar-border bg-sidebar">
        <AdminSidebarContent email={data.email} pathname={pathname} />
      </div>
      <div className="hidden lg:block w-64 shrink-0" aria-hidden="true" />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r border-sidebar-border bg-sidebar">
          <SheetHeader className="sr-only">
            <SheetTitle>Admin Navigation</SheetTitle>
          </SheetHeader>
          <AdminSidebarContent
            email={data.email}
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 sm:px-6 sticky top-0 z-20 lg:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open admin menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <span className="text-sm font-semibold">AutoPulse Admin</span>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
