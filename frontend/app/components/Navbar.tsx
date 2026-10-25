"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  // Track page scroll position to apply 1px bottom border after scrolling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-background transition-colors ${
        isScrolled ? "border-b border-border" : "border-b border-transparent"
      }`}
    >
      <div className="page-container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        {/* Brand wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2 group text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <div className="size-7 rounded-md bg-card border border-border flex items-center justify-center text-primary group-hover:border-primary/40 transition-colors">
            <Activity className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <span className="font-display font-semibold text-lg text-foreground tracking-tight">
            AutoPulse
          </span>
        </Link>

        {/* Action controls */}
        <div className="flex items-center gap-3">
          <Link href="/auth/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/auth/sign-up">
            <Button variant="default" size="sm">
              Create your account
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
