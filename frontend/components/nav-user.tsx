"use client";

import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { EllipsisVerticalIcon, SettingsIcon, LogOutIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAction } from "@/app/app/actions";
import { clearAllAppCaches } from "@/lib/queries";

export interface NavUserData {
  name?: string | null;
  email: string;
}

export function NavUser({ user }: { user: NavUserData }) {
  const { isMobile } = useSidebar();
  const displayName = user.name || user.email.split("@")[0] || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              aria-label="User account menu"
            >
              <Avatar className="h-8 w-8 rounded-md bg-muted text-foreground border border-border">
                <AvatarFallback className="rounded-md text-xs font-semibold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-xs leading-tight min-w-0">
                <span className="truncate font-medium text-foreground">
                  {displayName}
                </span>
                <span className="truncate text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <EllipsisVerticalIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-md"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-2 font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-foreground truncate">
                  {displayName}
                </p>
                <p className="text-xs leading-none text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/app/settings" className="flex items-center gap-2 cursor-pointer">
                  <SettingsIcon className="size-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form
                action={signOutAction}
                onSubmit={() => {
                  clearAllAppCaches();
                }}
                className="w-full"
              >
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 text-destructive cursor-pointer"
                >
                  <LogOutIcon className="size-4" />
                  <span>Sign out</span>
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
