"use client";

import {
  getRecommendedTextColor,
  hasAccessibleContrast,
  parseHexColor,
} from "@/lib/contrast";

interface BrandPreviewCardProps {
  brandName: string;
  primaryHex: string;
  accentHex: string;
  showWarning?: boolean;
}

export function BrandPreviewCard({
  brandName,
  primaryHex,
  accentHex,
  showWarning = true,
}: BrandPreviewCardProps) {
  // Fallback to valid defaults if user has typed an incomplete hex code
  const isValidPrimary = parseHexColor(primaryHex) !== null;
  const isValidAccent = parseHexColor(accentHex) !== null;

  const activePrimary = isValidPrimary ? primaryHex : "#0B7F70";
  const activeAccent = isValidAccent ? accentHex : "#14B8A6";

  const textColor = getRecommendedTextColor(activePrimary);
  const isAccessible = hasAccessibleContrast(activePrimary);

  return (
    <div className="space-y-2 text-left">
      {/* Square preview card made with CSS */}
      <div
        className="w-40 h-40 rounded-[12px] p-4 flex flex-col justify-between shadow-xs border border-line/40 transition-colors duration-150 relative overflow-hidden"
        style={{ backgroundColor: activePrimary }}
      >
        {/* Accent Bar at top */}
        <div
          className="h-1.5 w-10 rounded-full transition-colors duration-150"
          style={{ backgroundColor: activeAccent }}
          aria-hidden="true"
        />

        {/* Brand Name on primary color background */}
        <div className="my-auto">
          <p
            className="text-base font-semibold font-geist tracking-tight line-clamp-3 transition-colors duration-150"
            style={{ color: textColor }}
          >
            {brandName.trim() || "Brand Name"}
          </p>
        </div>

        {/* Subtle branding hint */}
        <div className="flex items-center justify-between text-[10px] font-mono opacity-70" style={{ color: textColor }}>
          <span>Preview</span>
          <span className="uppercase">{activePrimary}</span>
        </div>
      </div>

      {/* Warning message if contrast is below WCAG AA 4.5 */}
      {showWarning && isValidPrimary && !isAccessible && (
        <div
          role="alert"
          className="p-2.5 rounded-[8px] bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed max-w-[280px]"
        >
          This color may be hard to read in your images.
        </div>
      )}
    </div>
  );
}
