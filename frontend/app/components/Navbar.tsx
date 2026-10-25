"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ActivityIcon, MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-120 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-sm border-b border-border py-3"
          : "bg-background/80 backdrop-blur-sm border-b border-transparent py-4"
      }`}
    >
      <div className="page-container mx-auto px-4 md:px-6 flex items-center justify-between">
        {/* Brand logo & wordmark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-8 rounded-md bg-card border border-border flex items-center justify-center text-primary group-hover:border-primary/40 transition-colors">
            <ActivityIcon className="size-4" strokeWidth={1.5} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display font-semibold tracking-tight text-xl text-foreground">
              AutoPulse
            </span>
            <span className="inline-block size-1.5 rounded-full bg-primary" />
          </div>
        </Link>

        {/* Center navigation links (desktop) */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <a
            href="#how-it-works"
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            How it works
          </a>
          <a
            href="#workflow"
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Daily sequence
          </a>
          <a
            href="#faq"
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Questions
          </a>
        </div>

        {/* Navigation CTAs (desktop) */}
        <div className="hidden sm:flex items-center gap-3">
          <Link href="/auth/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/auth/sign-up">
            <Button variant="default" size="sm">
              Create account
            </Button>
          </Link>
        </div>

        {/* Mobile menu button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="sm:hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? (
            <XIcon className="size-4" />
          ) : (
            <MenuIcon className="size-4" />
          )}
        </Button>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-border bg-card px-4 py-4 space-y-4">
          <div className="flex flex-col space-y-2 text-sm font-medium">
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1.5"
            >
              How it works
            </a>
            <a
              href="#workflow"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1.5"
            >
              Daily sequence
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1.5"
            >
              Questions
            </a>
          </div>
          <div className="pt-3 border-t border-border flex flex-col gap-2">
            <Link href="/auth/sign-in" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="outline" className="w-full">
                Sign in
              </Button>
            </Link>
            <Link href="/auth/sign-up" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="default" className="w-full">
                Create account
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
