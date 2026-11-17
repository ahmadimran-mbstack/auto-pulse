// Layout wrapper for the Terms of Service route that forces dark mode on the server
import React from "react";
import type { Viewport } from "next";

// Set mobile browser theme color and dark color scheme on the server
export const viewport: Viewport = {
  themeColor: "#08090C",
  colorScheme: "dark",
};

// Wrap terms page content in the forced-dark container
export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark force-dark min-h-screen bg-[var(--lp-bg)] text-[var(--lp-text-body)] antialiased">
      {children}
    </div>
  );
}

