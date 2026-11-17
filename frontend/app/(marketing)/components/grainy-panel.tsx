// This component renders a rounded panel with layered brand radial gradients and an SVG film grain overlay.
import React from "react";
import { cn } from "@/lib/utils";

// Encoded SVG feTurbulence noise texture as a lightweight data URI
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

export type GrainyPalette = "navy-ice" | "ice-navy" | "ink-glow" | "deep-blue";

interface GrainyPanelProps {
  variant?: GrainyPalette;
  angle?: number;
  grainAmount?: number;
  className?: string;
  children?: React.ReactNode;
}

// Helper to construct deep navy and ink layered radial gradients restricted strictly to allowed tokens
function getGradientStyle(variant: GrainyPalette, angle: number) {
  switch (variant) {
    case "ink-glow":
      // Ink-black panel with focused blue and ice glow accents
      return {
        backgroundColor: "#08090C",
        backgroundImage: `
          radial-gradient(ellipse 65% 55% at 50% 40%, rgba(26, 86, 184, 0.36) 0%, rgba(10, 42, 102, 0.24) 45%, transparent 75%),
          radial-gradient(circle at 75% 25%, rgba(191, 210, 238, 0.16) 0%, transparent 55%),
          radial-gradient(circle at 20% 80%, rgba(0, 23, 64, 0.78) 0%, transparent 60%)
        `,
        boxShadow: "var(--lp-highlight-top)",
      };

    case "ice-navy":
      // Deep navy and ink gradient with subtle ice highlight
      return {
        backgroundColor: "#08090C",
        backgroundImage: `
          radial-gradient(circle at 25% 30%, rgba(26, 86, 184, 0.32) 0%, transparent 60%),
          radial-gradient(circle at 80% 70%, rgba(0, 23, 64, 0.85) 0%, transparent 60%),
          radial-gradient(circle at 50% 15%, rgba(191, 210, 238, 0.12) 0%, transparent 50%),
          linear-gradient(${angle}deg, #08090C 0%, #0A1630 55%, #08090C 100%)
        `,
        boxShadow: "var(--lp-highlight-top)",
      };

    case "deep-blue":
      // Approval panel: deep navy, blue, and ice accents on ink canvas
      return {
        backgroundColor: "#08090C",
        backgroundImage: `
          radial-gradient(circle at 75% 30%, rgba(26, 86, 184, 0.34) 0%, transparent 60%),
          radial-gradient(circle at 25% 75%, rgba(191, 210, 238, 0.14) 0%, transparent 55%),
          radial-gradient(circle at 50% 20%, rgba(0, 23, 64, 0.82) 0%, transparent 55%),
          linear-gradient(${angle}deg, #08090C 0%, #091326 100%)
        `,
        boxShadow: "var(--lp-highlight-top)",
      };

    case "navy-ice":
    default:
      // Topic finder panel: deep navy and ink blend with subtle ice glow
      return {
        backgroundColor: "#08090C",
        backgroundImage: `
          radial-gradient(circle at 70% 30%, rgba(191, 210, 238, 0.14) 0%, transparent 55%),
          radial-gradient(circle at 20% 65%, rgba(0, 23, 64, 0.85) 0%, transparent 60%),
          radial-gradient(circle at 55% 85%, rgba(26, 86, 184, 0.28) 0%, transparent 55%),
          linear-gradient(${angle}deg, #08090C 0%, #0B162D 100%)
        `,
        boxShadow: "var(--lp-highlight-top)",
      };
  }
}

// GrainyPanel renders a rounded-3xl container with noise overlay and child content
export function GrainyPanel({
  variant = "navy-ice",
  angle = 135,
  grainAmount = 0.12,
  className,
  children,
}: GrainyPanelProps) {
  const gradientStyle = getGradientStyle(variant, angle);

  return (
    /* Rounded dark gradient panel with compact padding on mobile and taller desktop framing */
    <div
      className={cn(
        "relative rounded-3xl overflow-hidden border border-[var(--lp-border)] text-[var(--lp-text-heading)] p-4 sm:p-8 lg:p-12 flex items-center justify-center min-h-0 lg:min-h-[380px] w-full",
        className
      )}
      style={gradientStyle}
    >
      {/* Noise overlay layer with SVG feTurbulence and mix-blend-overlay */}
      <div
        className="pointer-events-none absolute inset-0 select-none"
        style={{
          backgroundImage: `url("${NOISE_DATA_URI}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
          opacity: grainAmount,
          mixBlendMode: "overlay",
        }}
        aria-hidden="true"
      />

      {/* Foreground content sitting cleanly above the grain layer */}
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

