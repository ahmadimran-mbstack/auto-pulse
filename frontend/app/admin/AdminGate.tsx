"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  CreditCard,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Users,
  Wallet,
} from "lucide-react";

import type { AppUser } from "@/components/providers/user-provider";
import { RoleBadge, UserAvatar } from "@/components/admin/shared";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignOut } from "@/hooks/use-sign-out";
import { getAdminBadgeCounts } from "@/lib/api";
import { getPostAuthRoute, performSuspendedSignOut } from "@/lib/auth/post-auth";
import { queryClient, useMeQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface AdminNavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
  badgeKey?: "pending_payments" | "open_tickets";
}

const ADMIN_GROUPS: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Overview",
    items: [{ title: "Overview", href: "/admin", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Manage",
    items: [
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Subscribers", href: "/admin/subscribers", icon: CreditCard },
      { title: "Payments", href: "/admin/payments", icon: Wallet, badgeKey: "pending_payments" },
      { title: "Plans", href: "/admin/plans", icon: Layers },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Usage", href: "/admin/usage", icon: Activity },
      { title: "Support", href: "/admin/support", icon: LifeBuoy, badgeKey: "open_tickets" },
    ],
  },
];

function getBreadcrumbLabel(pathname: string): { section: string; detail?: string } {
  if (pathname === "/admin") return { section: "Overview" };
  if (pathname === "/admin/users") return { section: "Users" };
  if (pathname.startsWith("/admin/users/")) return { section: "Users", detail: "User detail" };
  if (pathname === "/admin/subscribers") return { section: "Subscribers" };
  if (pathname === "/admin/payments") return { section: "Payments" };
  if (pathname === "/admin/plans") return { section: "Plans" };
  if (pathname === "/admin/usage") return { section: "Usage" };
  if (pathname === "/admin/support") return { section: "Support" };
  if (pathname.startsWith("/admin/support/")) return { section: "Support", detail: "Ticket detail" };
  return { section: "Overview" };
}

function AdminSidebarInner({
  user,
  adminEmail,
  pathname,
  badges,
}: {
  user?: AppUser;
  adminEmail: string;
  pathname: string;
  badges?: { pending_payments: number; open_tickets: number };
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { signOut, isSigningOut } = useSignOut();

  const effectiveEmail = user?.email || adminEmail;
  const displayName = user?.name?.trim() || effectiveEmail.split("@")[0] || "Admin";
  const closeIfMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="h-14 border-b border-sidebar-border justify-center px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="Admin | AutoPulse"
              className="bg-transparent text-foreground [&_svg]:text-foreground hover:bg-transparent hover:text-foreground active:bg-transparent"
            >
              <Link href="/admin" onClick={closeIfMobile} className="flex items-center gap-2.5">
                <div className="relative flex size-6 shrink-0 items-center justify-center rounded-sm overflow-hidden">
                  <Image
                    src="/logo-mark-blue-bg.png"
                    alt="AutoPulse logo"
                    width={24}
                    height={24}
                    priority
                    className="hidden h-full w-full object-contain dark:block"
                  />
                  <Image
                    src="/logo-mark-white-bg.png"
                    alt="AutoPulse logo"
                    width={24}
                    height={24}
                    priority
                    className="block h-full w-full object-contain dark:hidden"
                  />
                </div>
                <div className="flex items-center gap-2 truncate group-data-[collapsible=icon]:hidden">
                  <span className="text-sm font-semibold tracking-tight text-foreground">
                    AutoPulse
                  </span>
                  <span className="inline-flex items-center rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-500/25 dark:text-violet-300 dark:ring-violet-400/25">
                    Admin
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        {ADMIN_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const count = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={count > 0 ? `${item.title} (${count})` : item.title}
                        className="h-9"
                      >
                        <Link
                          href={item.href}
                          onClick={closeIfMobile}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon className="size-4 shrink-0" strokeWidth={1.65} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge
                          className={cn(
                            "rounded-full px-1.5 text-[11px] font-medium tabular-nums ring-1 ring-inset",
                            item.badgeKey === "pending_payments"
                              ? "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300"
                              : "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300"
                          )}
                        >
                          {count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Back to app"
                  className="h-9"
                >
                  <Link href="/app" onClick={closeIfMobile}>
                    <ArrowLeft className="size-4 shrink-0" strokeWidth={1.65} />
                    <span>Back to app</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  aria-label="Admin account menu"
                  className="bg-transparent text-foreground hover:bg-sidebar-accent hover:text-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-foreground"
                >
                  <UserAvatar
                    userId={user?.id || effectiveEmail}
                    name={displayName}
                    email={effectiveEmail}
                    imageUrl={user?.image}
                    size="sm"
                  />
                  <div className="grid flex-1 text-left text-xs leading-tight group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium text-foreground">{displayName}</span>
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {effectiveEmail}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side={isMobile ? "bottom" : "top"}
                align="start"
                sideOffset={8}
                className="w-60 rounded-lg"
              >
                <DropdownMenuLabel className="p-2.5 font-normal space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate text-foreground">
                      {displayName}
                    </span>
                    <RoleBadge label="Super admin" />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{effectiveEmail}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/app" onClick={closeIfMobile}>
                    <ArrowLeft className="size-4 mr-2" />
                    <span>Back to app</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer">
                    <Sun className="size-4 mr-2" />
                    <span>Theme</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer">
                      <Sun className="size-4 mr-2" />
                      <span>Light</span>
                      {theme === "light" && <Check className="size-3.5 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
                      <Moon className="size-4 mr-2" />
                      <span>Dark</span>
                      {theme === "dark" && <Check className="size-3.5 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer">
                      <Monitor className="size-4 mr-2" />
                      <span>System</span>
                      {(!theme || theme === "system") && <Check className="size-3.5 ml-auto" />}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isSigningOut}
                  onSelect={(e) => {
                    e.preventDefault();
                    signOut();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    signOut();
                  }}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  {isSigningOut ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <LogOut className="size-4 mr-2" />
                  )}
                  <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export function AdminGate({
  user,
  defaultSidebarOpen = true,
  children,
}: {
  user?: AppUser;
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const crumb = getBreadcrumbLabel(pathname);

  const { isLoading, isError, data } = useMeQuery(user?.id || "");

  const { data: badges } = useQuery({
    queryKey: ["admin-badge-counts"],
    queryFn: getAdminBadgeCounts,
    enabled: Boolean(data?.is_admin),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  React.useEffect(() => {
    if (isLoading) return;
    if (data?.status === "suspended") {
      performSuspendedSignOut(() => queryClient.clear()).then(() => {
        router.replace(getPostAuthRoute(data));
      });
      return;
    }
    if (data && !data.is_admin) {
      const target = getPostAuthRoute(data);
      if (target !== "/admin" && !pathname.startsWith(target)) {
        router.replace(target);
      }
      return;
    }
    if (isError || !data) {
      router.replace("/auth/sign-in");
    }
  }, [isLoading, isError, data, pathname, router]);

  React.useEffect(() => {
    if (typeof document !== "undefined" && data?.is_admin) {
      const pageLabel = crumb.detail || crumb.section;
      document.title = `${pageLabel} | Admin | AutoPulse`;
    }
  }, [crumb.section, crumb.detail, data?.is_admin]);

  if (isLoading || isError || !data?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="space-y-3 w-48">
          <Skeleton className="h-6 w-36 mx-auto" />
          <Skeleton className="h-3 w-48 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AdminSidebarInner
        user={user}
        adminEmail={data.email || user?.email || ""}
        pathname={pathname}
        badges={badges}
      />

      <SidebarInset className="bg-background min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <SidebarTrigger className="-ml-1" aria-label="Toggle admin sidebar" />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList>
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink asChild>
                    <Link href="/admin">Admin</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:inline-flex" />
                {crumb.detail ? (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link
                          href={crumb.section === "Users" ? "/admin/users" : "/admin/support"}
                        >
                          {crumb.section}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-medium truncate">
                        {crumb.detail}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : (
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-medium truncate">{crumb.section}</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <ThemeToggle />
        </header>

        <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 sm:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
