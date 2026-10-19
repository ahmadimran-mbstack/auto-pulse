"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
      className={`sticky top-0 z-50 transition-all duration-200 ${
        isScrolled
          ? "bg-paper/90 backdrop-blur-md border-b border-line shadow-xs py-3.5"
          : "bg-paper/80 backdrop-blur-xs border-b border-transparent py-5"
      }`}
    >
      <div className="max-w-[1160px] mx-auto px-6 flex items-center justify-between">
        {/* Brand logo & wordmark */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-[8px] bg-surface border border-line flex items-center justify-center text-signal group-hover:border-signal/40 group-hover:bg-signal-soft/50 transition-colors">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h5l3-7 4 14 3-7h3" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-geist font-normal tracking-tighter text-xl text-ink">
              AutoPulse
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-signal animate-pulse-glow" />
          </div>
        </Link>

        {/* Center navigation links (desktop) */}
        <div className="hidden md:flex items-center gap-7 text-sm">
          <a
            href="#how-it-works"
            className="text-muted hover:text-ink transition-colors font-medium"
          >
            How it works
          </a>
          <a
            href="#workflow"
            className="text-muted hover:text-ink transition-colors font-medium"
          >
            Daily sequence
          </a>
          <a
            href="#faq"
            className="text-muted hover:text-ink transition-colors font-medium"
          >
            Questions
          </a>
        </div>

        {/* Navigation CTAs (desktop) */}
        <div className="hidden sm:flex items-center gap-4">
          <Link
            href="/auth/sign-in"
            className="px-3 py-1.5 text-sm font-medium text-muted hover:text-ink transition-colors cursor-pointer"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="px-4 py-2 bg-signal text-surface rounded-[8px] text-sm font-medium hover:bg-signal-hover transition-all cursor-pointer shadow-xs active:translate-y-[1px]"
          >
            Create account
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="sm:hidden p-2 text-muted hover:text-ink rounded-[6px] border border-line bg-surface cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-line bg-surface px-6 py-5 space-y-4">
          <div className="flex flex-col space-y-3 text-sm font-medium">
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted hover:text-ink py-1"
            >
              How it works
            </a>
            <a
              href="#workflow"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted hover:text-ink py-1"
            >
              Daily sequence
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted hover:text-ink py-1"
            >
              Questions
            </a>
          </div>
          <div className="pt-3 border-t border-line flex flex-col gap-2.5">
            <Link
              href="/auth/sign-in"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2 text-sm font-medium text-ink border border-line rounded-[8px] bg-paper"
            >
              Sign in
            </Link>
            <Link
              href="/auth/sign-up"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2 text-sm font-medium text-surface bg-signal rounded-[8px]"
            >
              Create account
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
