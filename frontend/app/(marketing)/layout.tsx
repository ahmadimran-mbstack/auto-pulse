// This layout wraps marketing pages in forced-dark mode without touching auth or dashboard routes.
import React from "react";
import type { Viewport } from "next";

// Set mobile browser theme color and dark color scheme on the server
export const viewport: Viewport = {
  themeColor: "#08090C",
  colorScheme: "dark",
};

// This component provides the forced-dark outer container for marketing pages.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark force-dark min-h-screen bg-[var(--lp-bg)] text-[var(--lp-text-body)] antialiased selection:bg-[var(--lp-blue)]/40 selection:text-[var(--lp-text-heading)]">
      {children}
    </div>
  );
}
