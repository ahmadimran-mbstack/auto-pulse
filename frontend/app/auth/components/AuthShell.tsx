"use client";

// Shared split-screen layout for all authentication pages
// Left panel is 55% with static AutoPulse navy/blue/ice gradients; right panel is 45%
import React from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Subtle film grain noise texture using SVG feTurbulence
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

export interface AuthShellProps {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  agreementType?: "sign-in" | "sign-up" | "none";
  className?: string;
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  agreementType = "none",
  className,
}: AuthShellProps) {
  return (
    /* Lock desktop to 100dvh with no page scroll, and force regular 400 weight on all auth headings/buttons/labels */
    <div className="min-h-dvh lg:h-dvh lg:overflow-hidden w-full flex flex-col lg:flex-row bg-[var(--lp-bg)] text-[var(--lp-text-body)] font-normal [&_h1]:!font-normal [&_h2]:!font-normal [&_h3]:!font-normal [&_button]:!font-normal [&_label]:!font-normal">
      {/* Left Visual Panel: 55% width on desktop, hidden below lg, static AutoPulse navy/blue/ice palette */}
      <section
        className="hidden lg:flex lg:w-[55%] h-full min-h-0 relative overflow-hidden select-none bg-[#001740] flex-col justify-end p-10"
        aria-hidden="true"
      >
        {/* Static layered radial gradients in AutoPulse deep navy, navy, blue, and ice */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(circle 580px at 82% 18%, rgba(26, 86, 184, 0.72) 0%, transparent 70%),
              radial-gradient(circle 420px at 62% 30%, rgba(191, 210, 238, 0.28) 0%, transparent 62%),
              radial-gradient(circle 520px at 18% 82%, rgba(10, 42, 102, 0.85) 0%, transparent 72%)
            `,
          }}
        />

        {/* Bottom dark navy fade for clear text contrast */}
        <div
          className="pointer-events-none absolute inset-0 z-[2]"
          style={{
            backgroundImage:
              "linear-gradient(to top, #001740 0%, rgba(0, 23, 64, 0.9) 24%, rgba(0, 23, 64, 0.45) 52%, transparent 100%)",
          }}
        />

        {/* Fine film grain noise overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-[3] select-none"
          style={{
            backgroundImage: `url("${NOISE_DATA_URI}")`,
            backgroundRepeat: "repeat",
            backgroundSize: "160px 160px",
            opacity: 0.14,
            mixBlendMode: "overlay",
          }}
        />

        {/* Bottom-aligned left panel copy with clamped typography and short-window hiding */}
        <div className="relative z-10 min-h-0 flex flex-col justify-end w-full max-w-xl text-left">
          <div className="flex items-center gap-2 mb-5">
            <Badge
              variant="outline"
              className="rounded-full px-3 py-1 text-xs border-white/15 bg-white/5 text-white/80 backdrop-blur font-normal"
            >
              Draft
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full px-3 py-1 text-xs border-white/15 bg-white/5 text-white/80 backdrop-blur font-normal"
            >
              Approve
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full px-3 py-1 text-xs border-white/15 bg-white/5 text-white/80 backdrop-blur font-normal"
            >
              Publish
            </Badge>
          </div>

          <h2 className="text-[clamp(26px,2.4vw,34px)] font-normal tracking-[-0.02em] leading-[1.15] text-white max-w-lg mb-3">
            Your LinkedIn Manager focused on making your personal brand grow by managing the entire pipeline.
          </h2>

          <p className="text-[clamp(14px,1.05vw,16px)] text-white/65 max-w-md font-normal leading-relaxed [@media(max-height:639px)]:hidden">
            AutoPulse finds topics, drafts posts, checks them, and sends them to you for approval. Nothing goes live until you say so.
          </p>
        </div>
      </section>

      {/* Right Form Panel: centered with my-auto so tall content never clips at the top */}
      <section className="w-full lg:w-[45%] min-h-dvh lg:min-h-0 lg:h-full lg:overflow-y-auto flex flex-col px-5 py-4 sm:px-8 sm:py-6 lg:px-8 lg:py-4 bg-[var(--lp-bg)]">
        <div className={cn("w-full max-w-[360px] my-auto mx-auto flex flex-col text-left", className)}>
          {/* AutoPulse brand logo (32px) with 20px space below */}
          <div className="mb-5">
            <Logo size={32} />
          </div>

          {/* Form heading: 24px, 1.15 line-height, balanced wrap, 6px below */}
          <h1 className="text-2xl font-normal tracking-[-0.02em] leading-[1.15] text-balance text-[var(--lp-text-heading)] mb-[6px]">
            {title}
          </h1>

          {/* Subtitle description: 14px, 1.4 line-height, 20px below */}
          <div className="text-sm leading-[1.4] text-[var(--lp-text-muted)] mb-5 font-normal">
            {description}
          </div>

          {/* Interactive form body with no stacked outer spacing */}
          <div className="w-full">
            {children}
          </div>

          {/* Agreement line: 12px below submit button, 1.4 line-height */}
          {agreementType !== "none" && (
            <p className="text-xs leading-[1.4] text-[var(--lp-text-muted)] mt-3 text-center font-normal">
              {agreementType === "sign-in" ? (
                <>
                  By signing in, you agree to our{" "}
                  <Link
                    href="/terms"
                    className="underline underline-offset-4 text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] font-normal"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-4 text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] font-normal"
                  >
                    Privacy Policy
                  </Link>
                  .
                </>
              ) : (
                <>
                  By creating an account, you agree to our{" "}
                  <Link
                    href="/terms"
                    className="underline underline-offset-4 text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] font-normal"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-4 text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] font-normal"
                  >
                    Privacy Policy
                  </Link>
                  .
                </>
              )}
            </p>
          )}

          {/* Supplemental action footer links */}
          {footer && (
            <div className="mt-3 pt-3 border-t border-[var(--lp-border-hairline)] text-sm text-[var(--lp-text-muted)] text-center font-normal">
              {footer}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export const AuthLayout = AuthShell;
