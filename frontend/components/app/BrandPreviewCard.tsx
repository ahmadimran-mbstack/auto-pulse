"use client";

import * as React from "react";
import {
  getRecommendedTextColor,
  hasAccessibleContrast,
  parseHexColor,
} from "@/lib/contrast";

export interface BrandPreviewCardProps {
  brandName: string;
  primaryHex: string;
  accentHex: string;
  showWarning?: boolean;
}

// Visual preview showing how user brand colors and typography look together
export function BrandPreviewCard({
  brandName,
  primaryHex,
  accentHex,
  showWarning = true,
}: BrandPreviewCardProps) {
  // Validate hex colors or fallback safely to system tokens
  const isValidPrimary = parseHexColor(primaryHex) !== null;
  const isValidAccent = parseHexColor(accentHex) !== null;

  const activePrimary = isValidPrimary ? primaryHex : "var(--primary)";
  const activeAccent = isValidAccent ? accentHex : "var(--signal-line)";

  const textColor = isValidPrimary
    ? getRecommendedTextColor(primaryHex)
    : "var(--primary-foreground)";
  const isAccessible = isValidPrimary ? hasAccessibleContrast(primaryHex) : true;

  return (
    <div className="space-y-2 text-left">
      {/* Square preview card */}
      <div
        className="size-40 rounded-lg p-4 flex flex-col justify-between border border-border transition-colors duration-120 relative overflow-hidden"
        style={{ backgroundColor: activePrimary }}
      >
        {/* Accent Bar at top */}
        <div
          className="h-1.5 w-10 rounded-full transition-colors duration-120"
          style={{ backgroundColor: activeAccent }}
          aria-hidden="true"
        />

        {/* Brand Name on primary color background */}
        <div className="my-auto">
          <p
            className="text-base font-semibold tracking-tight line-clamp-3 transition-colors duration-120"
            style={{ color: textColor }}
          >
            {brandName.trim() || "Brand Name"}
          </p>
        </div>

        {/* Subtle branding hint */}
        <div
          className="flex items-center justify-between text-caption font-mono opacity-80"
          style={{ color: textColor }}
        >
          <span>Preview</span>
          <span className="uppercase">{isValidPrimary ? primaryHex : "AutoPulse"}</span>
        </div>
      </div>

      {/* Warning message if contrast is below WCAG AA 4.5 */}
      {showWarning && isValidPrimary && !isAccessible && (
        <div
          role="alert"
          className="p-2.5 rounded-md bg-status-draft-bg border border-status-draft-fg/20 text-xs text-status-draft-fg leading-relaxed max-w-xs"
        >
          This color may be hard to read in your images.
        </div>
      )}
    </div>
  );
}
