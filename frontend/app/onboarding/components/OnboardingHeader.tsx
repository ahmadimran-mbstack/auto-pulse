"use client";

import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { useSignOut } from "@/hooks/use-sign-out";
import { Button } from "@/components/ui/button";

// Top navigation bar for the onboarding flow
// Shows the brand logo on the left and a sign out button on the right
export function OnboardingHeader() {
  const { signOut, isSigningOut } = useSignOut();

  return (
    <header className="border-b border-border bg-card sticky top-0 z-40">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand logo link that keeps user on onboarding */}
        <Link
          href="/onboarding"
          className="flex items-center gap-2 group transition-opacity hover:opacity-90"
        >
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
          <span className="font-display font-semibold text-h3 text-foreground tracking-tight">
            AutoPulse
          </span>
        </Link>

        {/* Sign out link button so users can exit the flow safely */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={signOut}
          disabled={isSigningOut}
          className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          <LogOut className="size-3.5" />
          <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
        </Button>
      </div>
    </header>
  );
}

