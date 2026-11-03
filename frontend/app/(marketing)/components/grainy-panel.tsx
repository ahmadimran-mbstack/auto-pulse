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

// Helper to construct layered radial gradients restricted strictly to allowed tokens
function getGradientStyle(variant: GrainyPalette, angle: number) {
  switch (variant) {
    case "ink-glow":
      // Ink-black panel (c) with focused blue and ice glow accents
      return {
        backgroundColor: "#08090C",
        backgroundImage: `
          radial-gradient(ellipse 65% 55% at 50% 40%, rgba(26, 86, 184, 0.42) 0%, rgba(10, 42, 102, 0.25) 45%, transparent 75%),
          radial-gradient(circle at 75% 25%, rgba(191, 210, 238, 0.28) 0%, transparent 55%),
          radial-gradient(circle at 20% 80%, rgba(0, 23, 64, 0.8) 0%, transparent 60%)
        `,
      };

    case "ice-navy":
      // Inverted angle palette with ice highlights and quiet navy depth
      return {
        backgroundColor: "#FAFAFA",
        backgroundImage: `
          radial-gradient(circle at 25% 30%, rgba(191, 210, 238, 0.75) 0%, rgba(255, 255, 255, 0) 65%),
          radial-gradient(circle at 80% 70%, rgba(10, 42, 102, 0.16) 0%, rgba(255, 255, 255, 0) 55%),
          radial-gradient(circle at 50% 90%, rgba(26, 86, 184, 0.12) 0%, transparent 50%),
          linear-gradient(${angle}deg, #FFFFFF 0%, #FAFAFA 50%, #F0F4FA 100%)
        `,
      };

    case "deep-blue":
      // Approval panel: navy, blue, and ice mix
      return {
        backgroundColor: "#FAFAFA",
        backgroundImage: `
          radial-gradient(circle at 75% 30%, rgba(26, 86, 184, 0.22) 0%, transparent 60%),
          radial-gradient(circle at 25% 75%, rgba(191, 210, 238, 0.7) 0%, transparent 60%),
          radial-gradient(circle at 50% 20%, rgba(10, 42, 102, 0.14) 0%, transparent 50%),
          linear-gradient(${angle}deg, #FFFFFF 0%, #F5F7FB 100%)
        `,
      };

    case "navy-ice":
    default:
      // Topic finder panel: airy navy and ice blend with soft white core
      return {
        backgroundColor: "#FAFAFA",
        backgroundImage: `
          radial-gradient(circle at 70% 30%, rgba(191, 210, 238, 0.85) 0%, transparent 55%),
          radial-gradient(circle at 20% 65%, rgba(10, 42, 102, 0.18) 0%, transparent 60%),
          radial-gradient(circle at 55% 85%, rgba(26, 86, 184, 0.12) 0%, transparent 50%),
          linear-gradient(${angle}deg, #FFFFFF 0%, #F8FAFC 100%)
        `,
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
    <div
      className={cn(
        "relative rounded-3xl overflow-hidden border p-6 sm:p-10 md:p-12 flex items-center justify-center min-h-[380px] w-full",
        variant === "ink-glow"
          ? "border-white/10 text-white"
          : "border-border-light text-ink",
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

