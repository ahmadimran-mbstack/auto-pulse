// Shared layout shell for public legal pages (Terms and Privacy)
// Provides a top navigation bar, sticky table of contents, reading position tracker, and footer
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/app/auth/components/Logo";
import { LEGAL_CONFIG } from "@/lib/legal-config";
import { cn } from "@/lib/utils";

export interface LegalSection {
  id: string;
  title: string;
}

export interface LegalShellProps {
  title: string;
  sections: LegalSection[];
  children: React.ReactNode;
}

// Layout wrapper for Terms and Privacy with responsive sticky sidebar navigation
export function LegalShell({ title, sections, children }: LegalShellProps) {
  // Track which section header is currently in the reading area
  const [activeId, setActiveId] = useState<string>(sections[0]?.id || "");

  // IntersectionObserver to highlight current section as user scrolls
  useEffect(() => {
    const sectionElements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sectionElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // Select the visible section closest to the top of the viewport
          const topEntry = visibleEntries.reduce((prev, curr) =>
            prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr
          );
          setActiveId(topEntry.target.id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: [0, 0.2, 0.5, 1],
      }
    );

    sectionElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased">
      {/* Top bar with logo on the left and sign-in link on the right */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={34} href="/" />
            <span className="font-normal text-base tracking-tight text-foreground">
              {LEGAL_CONFIG.PRODUCT_NAME}
            </span>
          </div>

          <Link
            href="/auth/sign-in"
            className="text-sm font-normal text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Main page content area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 sm:py-14">
        {/* Page header with title and effective date */}
        <div className="mb-10 sm:mb-12 border-b border-border/70 pb-6 sm:pb-8">
          <h1 className="text-3xl sm:text-[44px] font-normal tracking-[-0.035em] text-foreground leading-[1.1] mb-2">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground font-normal">
            Last updated: {LEGAL_CONFIG.LAST_UPDATED}
          </p>
        </div>

        {/* Mobile collapsible table of contents (native details element) */}
        <details className="lg:hidden mb-8 rounded-lg border border-border bg-card/60 p-4 text-sm group">
          <summary className="font-medium cursor-pointer text-foreground flex items-center justify-between select-none">
            <span>Table of contents</span>
            <span className="text-xs text-muted-foreground group-open:hidden">Tap to expand</span>
            <span className="text-xs text-muted-foreground hidden group-open:inline">Tap to collapse</span>
          </summary>
          <nav className="mt-3 pt-3 border-t border-border flex flex-col space-y-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-muted-foreground hover:text-foreground py-1 transition-colors text-sm"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </details>

        {/* Two-column layout on desktop: sticky contents on left, reading body on right */}
        <div className="flex flex-col lg:flex-row gap-12 xl:gap-16 items-start">
          {/* Desktop sticky sidebar with table of contents */}
          <aside className="hidden lg:block w-64 shrink-0 sticky top-24 self-start max-h-[calc(100vh-8rem)] overflow-y-auto pr-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              Contents
            </div>
            <nav className="space-y-1 text-sm border-l border-border/70">
              {sections.map((section) => {
                const isActive = activeId === section.id;
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={cn(
                      "block py-1.5 pl-4 text-sm transition-colors border-l-2 -ml-px",
                      isActive
                        ? "border-foreground text-foreground font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {section.title}
                  </a>
                );
              })}
            </nav>
          </aside>

          {/* Right column reading text container */}
          <article className="max-w-[680px] w-full text-foreground/90 leading-[1.7] space-y-10 text-base font-normal">
            {children}
          </article>
        </div>
      </main>

      {/* Public footer with legal cross-links and contact information */}
      <footer className="border-t border-border/70 bg-card/40 mt-16 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <a
              href={`mailto:${LEGAL_CONFIG.CONTACT_EMAIL}`}
              className="hover:text-foreground transition-colors"
            >
              Contact ({LEGAL_CONFIG.CONTACT_EMAIL})
            </a>
          </div>

          <p className="font-normal">
            (c) {new Date().getFullYear()} {LEGAL_CONFIG.PRODUCT_NAME}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

