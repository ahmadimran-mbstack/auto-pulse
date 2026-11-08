"use client";

// Shared split-screen layout for all authentication pages
// Left visual panel 55%, Right form panel 45% (using min-h-svh)
// Left features deep dark Aceternity BackgroundGradientAnimation with SVG film grain overlay
// Zero heavy or medium font weights across entire auth surface (all font-normal)
import React from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { Badge } from "@/components/ui/badge";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { BlurFade } from "@/components/ui/blur-fade";
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
    <div className="min-h-svh w-full flex flex-col lg:flex-row bg-white dark:bg-background text-foreground font-normal">
      {/* Left Visual Panel (55% width on desktop, hidden on < lg) */}
      <section
        className="hidden lg:flex lg:w-[55%] relative overflow-hidden select-none bg-[#05050A] min-h-svh flex-col justify-end"
        aria-hidden="true"
      >
        {/* Layer 0: Aceternity Background Gradient Animation (slow ambient movement 30-40s) */}
        <div className="absolute inset-0 w-full h-full pointer-events-none">
          <BackgroundGradientAnimation
            gradientBackgroundStart="rgb(5, 5, 10)"
            gradientBackgroundEnd="rgb(5, 5, 10)"
            firstColor="59, 47, 160"
            secondColor="139, 124, 246"
            thirdColor="11, 27, 77"
            fourthColor="59, 47, 160"
            fifthColor="11, 27, 77"
            pointerColor="139, 124, 246"
            size="75%"
            blendingValue="screen"
            interactive={false}
            containerClassName="h-full w-full absolute inset-0"
          />
        </div>

        {/* Layer 1, 2, 3: Calibrated deep radial color accents */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(circle 600px at 85% 15%, rgba(59, 47, 160, 0.7) 0%, transparent 70%),
              radial-gradient(circle 380px at 65% 25%, rgba(139, 124, 246, 0.45) 0%, transparent 60%),
              radial-gradient(circle 500px at 15% 85%, rgba(11, 27, 77, 0.6) 0%, transparent 70%)
            `,
          }}
        />

        {/* Bottom 35% dark fade to guarantee WCAG AAA copy legibility */}
        <div
          className="pointer-events-none absolute inset-0 z-[2]"
          style={{
            backgroundImage:
              "linear-gradient(to top, #05050A 0%, #05050A 20%, rgba(5, 5, 10, 0.85) 42%, rgba(5, 5, 10, 0.25) 70%, transparent 100%)",
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

        {/* Left panel copy aligned to bottom left with Magic UI BlurFade entrance */}
        <div className="relative z-10 p-10 lg:p-14 xl:p-16 flex flex-col justify-end w-full max-w-xl text-left">
          {/* Staggered entrance for status badges */}
          <BlurFade delay={0.1} inView>
            <div className="flex items-center gap-2 mb-6">
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
          </BlurFade>

          {/* Staggered headline */}
          <BlurFade delay={0.2} inView>
            <h2 className="text-5xl xl:text-6xl font-normal tracking-tight leading-[1.05] text-white max-w-xl mb-4">
              Post on LinkedIn every day without writing a post.
            </h2>
          </BlurFade>

          {/* Staggered supporting subtext */}
          <BlurFade delay={0.3} inView>
            <p className="text-base text-white/60 max-w-md font-normal leading-relaxed">
              AutoPulse finds topics, drafts posts, checks them, and sends them to you for approval. Nothing goes live until you say so.
            </p>
          </BlurFade>
        </div>
      </section>

      {/* Right Form Panel (45% width on desktop, full width centered on mobile, min-h-svh) */}
      <section className="w-full lg:w-[45%] min-h-svh flex items-center justify-center p-6 sm:p-8 lg:p-10 bg-white dark:bg-background">
        <div className={cn("w-full max-w-[380px] flex flex-col text-left", className)}>
          {/* AutoPulse brand logo (32px) */}
          <div className="mb-3.5">
            <Logo size={32} />
          </div>

          {/* Form heading: text-4xl, font-normal, tracking-tight, leading-tight */}
          <h1 className="text-4xl font-normal tracking-tight leading-tight text-foreground mb-1.5">
            {title}
          </h1>

          {/* Subtitle description: text-sm, muted, one line */}
          <div className="text-sm text-neutral-500 dark:text-muted-foreground mb-5 leading-normal font-normal truncate">
            {description}
          </div>

          {/* Interactive form body */}
          <div className="w-full space-y-4">
            {children}
          </div>

          {/* Agreement line for sign in and sign up */}
          {agreementType !== "none" && (
            <p className="text-xs text-neutral-500 dark:text-muted-foreground mt-4 leading-relaxed text-center font-normal">
              {agreementType === "sign-in" ? (
                <>
                  By signing in, you agree to our{" "}
                  <Link
                    href="/terms"
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground font-normal"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground font-normal"
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
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground font-normal"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="underline underline-offset-4 text-foreground/80 hover:text-foreground font-normal"
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
            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-border text-sm text-neutral-500 dark:text-muted-foreground text-center font-normal">
              {footer}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// Export AuthLayout alias for full spec compliance
export const AuthLayout = AuthShell;
