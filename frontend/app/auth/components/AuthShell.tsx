// Shared split-screen layout for all authentication pages
// Left panel features a static dark grainy brand gradient with value proposition copy
// Right panel contains the theme-aware form container centered vertically and horizontally
import React from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

// Encoded SVG noise grain texture using feTurbulence
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

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
    <div className="min-h-dvh w-full flex flex-col lg:flex-row bg-white dark:bg-background text-foreground">
      {/* Left Panel: Static dark brand gradient with grain layer (visible on desktop lg and up) */}
      <section
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden select-none bg-[#001740]"
        style={{
          backgroundColor: "#001740",
          backgroundImage: `
            radial-gradient(ellipse 75% 65% at 20% 25%, rgba(26, 86, 184, 0.42) 0%, transparent 65%),
            radial-gradient(ellipse 65% 75% at 85% 70%, rgba(10, 42, 102, 0.75) 0%, transparent 70%),
            radial-gradient(circle at 65% 30%, rgba(191, 210, 238, 0.24) 0%, transparent 55%),
            radial-gradient(circle at 35% 85%, rgba(0, 23, 64, 0.95) 0%, transparent 70%),
            linear-gradient(145deg, #001740 0%, #0A2A66 50%, #001740 100%)
          `,
        }}
        aria-hidden="true"
      >
        {/* SVG film grain overlay with mix-blend-overlay */}
        <div
          className="pointer-events-none absolute inset-0 select-none"
          style={{
            backgroundImage: `url("${NOISE_DATA_URI}")`,
            backgroundRepeat: "repeat",
            backgroundSize: "180px 180px",
            opacity: 0.12,
            mixBlendMode: "overlay",
          }}
        />

        {/* Darkening gradient behind copy to ensure high text contrast */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0, 23, 64, 0.88) 0%, rgba(0, 23, 64, 0.4) 45%, transparent 75%)",
          }}
        />

        {/* Left panel copy aligned to bottom left with 64px padding */}
        <div className="relative z-10 p-12 lg:p-16 flex flex-col justify-end h-full w-full max-w-[620px] text-left">
          {/* Row of three small status pills */}
          <div className="flex items-center gap-2 mb-6">
            <span className="rounded-full px-3 py-1 text-xs border border-white/20 bg-white/10 text-white/90 backdrop-blur-sm font-medium">
              Draft
            </span>
            <span className="rounded-full px-3 py-1 text-xs border border-white/20 bg-white/10 text-white/90 backdrop-blur-sm font-medium">
              Approve
            </span>
            <span className="rounded-full px-3 py-1 text-xs border border-white/20 bg-white/10 text-white/90 backdrop-blur-sm font-medium">
              Publish
            </span>
          </div>

          {/* Value proposition headline */}
          <h2 className="text-3xl sm:text-[40px] font-normal tracking-[-0.035em] text-white leading-[1.12] mb-4">
            Post on LinkedIn every day without writing a post.
          </h2>

          {/* Descriptive supporting paragraph */}
          <p className="text-base sm:text-[18px] text-white/80 leading-relaxed max-w-[560px] mb-8 font-normal">
            AutoPulse finds topics, drafts posts, checks them, and sends them to you for approval. Nothing goes live until you say so.
          </p>

          {/* Quiet brand footer line */}
          <p className="text-xs sm:text-[14px] text-white/55 font-normal">
            AutoPulse. Automated LinkedIn posting with human approval.
          </p>
        </div>
      </section>

      {/* Right Panel: Content column centered horizontally and vertically */}
      <section className="w-full lg:w-1/2 min-h-dvh flex items-center justify-center px-6 py-10 sm:px-10 sm:py-12 lg:p-16 bg-white dark:bg-background">
        <div className={cn("w-full max-w-[430px] flex flex-col text-left", className)}>
          {/* AutoPulse brand logo */}
          <div className="mb-6 sm:mb-8">
            <Logo size={48} />
          </div>

          {/* Form title */}
          <h1 className="text-3xl sm:text-[40px] font-normal tracking-[-0.035em] text-foreground leading-[1.12] mb-2">
            {title}
          </h1>

          {/* Subtitle description */}
          <div className="text-base text-muted-foreground mb-6 sm:mb-8 leading-normal font-normal">
            {description}
          </div>

          {/* Interactive form body */}
          <div className="w-full space-y-4">
            {children}
          </div>

          {/* Agreement line for sign in and sign up */}
          {agreementType !== "none" && (
            <p className="text-[13px] text-muted-foreground mt-6 leading-relaxed text-center">
              {agreementType === "sign-in" ? (
                <>
                  By signing in, you agree to our{" "}
                  <Link
                    href="/terms"
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground"
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
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground"
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
            <div className="mt-6 pt-5 border-t border-border-light dark:border-border text-sm text-muted-foreground text-center">
              {footer}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

