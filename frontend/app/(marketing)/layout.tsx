// This layout wraps marketing pages without touching auth or dashboard routes.
import React from "react";

// This component provides the outer container for marketing pages.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink antialiased selection:bg-neutral-200">
      {children}
    </div>
  );
}
