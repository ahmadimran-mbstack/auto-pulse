// Redesigned "Get started in three steps" section with premium dark cards,
// dithered grain gradients, Magic UI MagicCard spotlight, BorderBeam on hover,
// BlurFade reveal, and frosted glass product mockups.
// Strict font-normal rule: zero heavy or medium weights anywhere in this component.
"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";
import { LinkedInIcon, SlackIcon } from "./platform-icons";
import { CheckCircle2 } from "lucide-react";

// Subtle SVG film grain noise overlay matching Section 2 auth panel
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

export function GetStarted() {
  return (

    /* Forced-dark steps section on #08090C canvas with 64px mobile vertical spacing */
    <section
      id="how-it-works"
      className="bg-[var(--lp-bg)] py-16 lg:py-28 border-t border-[var(--lp-border-hairline)] text-[var(--lp-text-body)] font-normal"
    >
      {/* Consistent 20px mobile container padding */}
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        {/* Section header with scroll reveal (no blur filter) */}
        <ScrollReveal className="max-w-2xl mb-10 lg:mb-16 text-left font-normal">
          <p className="text-[clamp(1.75rem,7vw,2.25rem)] lg:text-4xl font-normal tracking-tight text-[var(--lp-text-heading)]">
            Get started in three steps
          </p>
          <p className="mt-3 text-[15px] lg:text-lg text-[var(--lp-text-muted)] font-normal leading-relaxed">
            Setup takes minutes. AutoPulse finds topics, drafts posts, and never publishes without your explicit approval.
          </p>
        </ScrollReveal>

        {/* 3 equal columns on lg, stacked on mobile, gap-5, staggered 60ms */}
        <ScrollReveal stagger className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {/* Card 1: Step 01 - Navy / Blue / Ink */}
          <ScrollRevealItem className="h-full">
            <div className="touch-disable-hover relative h-full min-h-0 lg:min-h-[520px] rounded-3xl overflow-hidden group border border-[var(--lp-border)] hover:border-[var(--lp-border-hover)] bg-[var(--lp-surface)] shadow-[var(--lp-highlight-top)] flex flex-col justify-between transition-all duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:hover:-translate-y-0.5">
              {/* Navy, blue, and ice radial gradient over ink base */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    radial-gradient(circle 480px at 75% 15%, rgba(26, 86, 184, 0.34) 0%, transparent 70%),
                    radial-gradient(circle 320px at 85% 25%, rgba(191, 210, 238, 0.16) 0%, transparent 60%),
                    radial-gradient(circle 400px at 15% 85%, rgba(0, 23, 64, 0.85) 0%, transparent 70%)
                  `,
                }}
              />

              {/* Bottom dark fade */}
              <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, #08090C 0%, rgba(8, 9, 12, 0.72) 40%, transparent 100%)",
                }}
              />

              {/* SVG Film grain noise overlay */}
              <div
                className="pointer-events-none absolute inset-0 z-[2] select-none"
                style={{
                  backgroundImage: `url("${NOISE_DATA_URI}")`,
                  backgroundRepeat: "repeat",
                  backgroundSize: "160px 160px",
                  opacity: 0.15,
                  mixBlendMode: "overlay",
                }}
              />

              {/* Border Beam on hover only (hidden on touch devices) */}
              <div className="touch-hide-hover opacity-0 group-hover:opacity-100 transition-opacity duration-[350ms] pointer-events-none absolute inset-0 z-30">
                <BorderBeam
                  size={220}
                  duration={7}
                  colorFrom="#BFD2EE"
                  colorTo="#1A56B8"
                />
              </div>

              {/* Card content: top */}
              <div className="relative z-10 p-6 pb-0 lg:p-7 lg:pb-0 text-left space-y-3 font-normal">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--lp-text-muted)] font-mono font-normal">
                  STEP 01
                </p>
                <p className="text-[clamp(1.25rem,5vw,1.5rem)] lg:text-2xl font-normal tracking-tight text-[var(--lp-text-heading)]">
                  Connect your LinkedIn
                </p>
                <p className="text-[15px] lg:text-sm text-[var(--lp-text-body)] font-normal leading-relaxed max-w-sm">
                  Authorize your profile securely with standard OAuth permissions. We never post without your explicit approval.
                </p>
              </div>

              {/* Mockup 1: flush inside card on mobile, peeking out bottom on desktop */}
              <div className="relative z-10 px-5 pt-5 pb-5 lg:px-6 lg:pt-6 lg:pb-0 overflow-hidden mt-auto">
                <div className="touch-disable-hover bg-[var(--lp-surface-raised)]/90 border border-[var(--lp-border)] backdrop-blur-xl rounded-2xl p-4 lg:p-4.5 text-left transform translate-y-0 lg:translate-y-6 lg:group-hover:translate-y-3 transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]">
                  {/* Mockup header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--lp-border-hairline)]">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-lg bg-[var(--lp-navy-deep)] border border-[var(--lp-border)] flex items-center justify-center shrink-0">
                        <LinkedInIcon className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs text-[var(--lp-text-heading)] font-normal">Alex Rivera</div>
                        <div className="text-[11px] text-[var(--lp-text-muted)] font-normal">Founder and Operator</div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full text-[11px] font-normal border-[var(--lp-border)] text-[var(--lp-ice)] bg-[var(--lp-surface)] px-2 py-0.5"
                    >
                      Connected
                    </Badge>
                  </div>

                  {/* Topic chips */}
                  <div className="pt-3 space-y-2">
                    <div className="text-[11px] text-[var(--lp-text-muted)] uppercase tracking-wider font-normal">
                      Active topics
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className="rounded-full text-xs font-normal border-[var(--lp-border)] bg-[var(--lp-surface)] text-[var(--lp-text-body)] px-2.5 py-0.5"
                      >
                        B2B SaaS
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full text-xs font-normal border-[var(--lp-border)] bg-[var(--lp-surface)] text-[var(--lp-text-body)] px-2.5 py-0.5"
                      >
                        Founder journey
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full text-xs font-normal border-[var(--lp-border)] bg-[var(--lp-surface)] text-[var(--lp-text-body)] px-2.5 py-0.5"
                      >
                        Growth
                      </Badge>
                    </div>
                  </div>

                  {/* Tone pill & prompt sample */}
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--lp-text-muted)] font-normal">Tone</span>
                      <span className="text-xs font-normal text-[var(--lp-ice)] bg-[var(--lp-surface)] border border-[var(--lp-border)] px-2 py-0.5 rounded-full">
                        Direct and candid
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--lp-surface)] border border-[var(--lp-border-hairline)] text-[11px] text-[var(--lp-text-body)] font-normal leading-relaxed">
                      Prompt: Focus on real engineering milestones and metrics with zero generic platitudes.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollRevealItem>

          {/* Card 2: Step 02 - Deep Navy / Blue */}
          <ScrollRevealItem className="h-full">
            <div className="touch-disable-hover relative h-full min-h-0 lg:min-h-[520px] rounded-3xl overflow-hidden group border border-[var(--lp-border)] hover:border-[var(--lp-border-hover)] bg-[var(--lp-surface)] shadow-[var(--lp-highlight-top)] flex flex-col justify-between transition-all duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:hover:-translate-y-0.5">
              {/* Deep Navy / Blue / Ice background gradient */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    radial-gradient(circle 480px at 70% 15%, rgba(10, 42, 102, 0.85) 0%, transparent 70%),
                    radial-gradient(circle 340px at 85% 30%, rgba(26, 86, 184, 0.36) 0%, transparent 60%),
                    radial-gradient(circle 420px at 15% 85%, rgba(0, 23, 64, 0.8) 0%, transparent 70%)
                  `,
                }}
              />

              {/* Bottom dark fade */}
              <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, #08090C 0%, rgba(8, 9, 12, 0.72) 40%, transparent 100%)",
                }}
              />

              {/* SVG Film grain noise overlay */}
              <div
                className="pointer-events-none absolute inset-0 z-[2] select-none"
                style={{
                  backgroundImage: `url("${NOISE_DATA_URI}")`,
                  backgroundRepeat: "repeat",
                  backgroundSize: "160px 160px",
                  opacity: 0.15,
                  mixBlendMode: "overlay",
                }}
              />

              {/* Border Beam on hover only (hidden on touch devices) */}
              <div className="touch-hide-hover opacity-0 group-hover:opacity-100 transition-opacity duration-[350ms] pointer-events-none absolute inset-0 z-30">
                <BorderBeam
                  size={220}
                  duration={7}
                  colorFrom="#BFD2EE"
                  colorTo="#1A56B8"
                />
              </div>

              {/* Card content: top */}
              <div className="relative z-10 p-6 pb-0 lg:p-7 lg:pb-0 text-left space-y-3 font-normal">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--lp-text-muted)] font-mono font-normal">
                  STEP 02
                </p>
                <p className="text-[clamp(1.25rem,5vw,1.5rem)] lg:text-2xl font-normal tracking-tight text-[var(--lp-text-heading)]">
                  Receive your morning draft
                </p>
                <p className="text-[15px] lg:text-sm text-[var(--lp-text-body)] font-normal leading-relaxed max-w-sm">
                  AutoPulse researches trending discussions in your niche and delivers a polished draft to your inbox or Slack.
                </p>
              </div>

              {/* Mockup 2: flush inside card on mobile, peeking out bottom on desktop */}
              <div className="relative z-10 px-5 pt-5 pb-5 lg:px-6 lg:pt-6 lg:pb-0 overflow-hidden mt-auto">
                <div className="touch-disable-hover bg-[var(--lp-surface-raised)]/90 border border-[var(--lp-border)] backdrop-blur-xl rounded-2xl p-4 lg:p-4.5 text-left transform translate-y-0 lg:translate-y-6 lg:group-hover:translate-y-3 transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]">
                  {/* Notification header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--lp-border-hairline)]">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-md bg-[var(--lp-surface)] border border-[var(--lp-border)] flex items-center justify-center shrink-0">
                        <SlackIcon className="size-3.5" />
                      </div>
                      <span className="text-xs text-[var(--lp-text-heading)] font-normal">
                        AutoPulse drafted today&apos;s post
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--lp-text-muted)] font-normal">9:00 AM</span>
                  </div>

                  {/* 2-line post preview */}
                  <div className="py-3">
                    <p className="text-xs text-[var(--lp-text-body)] font-normal leading-relaxed line-clamp-2">
                      Great software products rarely win on feature count alone. They win because they remove friction from one essential daily task.
                    </p>
                  </div>

                  {/* Action buttons: Approve, Edit in dashboard */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-8 px-3.5 rounded-lg bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] font-normal text-xs"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 rounded-lg border-[var(--lp-border-input)] bg-[var(--lp-surface)] text-[var(--lp-text-heading)] hover:bg-white/10 font-normal text-xs"
                    >
                      Edit in dashboard
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollRevealItem>

          {/* Card 3: Step 03 - Ice / Blue / Navy */}
          <ScrollRevealItem className="h-full">
            <div className="touch-disable-hover relative h-full min-h-0 lg:min-h-[520px] rounded-3xl overflow-hidden group border border-[var(--lp-border)] hover:border-[var(--lp-border-hover)] bg-[var(--lp-surface)] shadow-[var(--lp-highlight-top)] flex flex-col justify-between transition-all duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:hover:-translate-y-0.5">
              {/* Ice into Navy background gradient */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    radial-gradient(circle 460px at 20% 15%, rgba(26, 86, 184, 0.34) 0%, transparent 65%),
                    radial-gradient(circle 380px at 80% 35%, rgba(191, 210, 238, 0.14) 0%, transparent 65%),
                    radial-gradient(circle 360px at 20% 85%, rgba(0, 23, 64, 0.85) 0%, transparent 70%)
                  `,
                }}
              />

              {/* Bottom dark fade */}
              <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, #08090C 0%, rgba(8, 9, 12, 0.72) 40%, transparent 100%)",
                }}
              />

              {/* SVG Film grain noise overlay */}
              <div
                className="pointer-events-none absolute inset-0 z-[2] select-none"
                style={{
                  backgroundImage: `url("${NOISE_DATA_URI}")`,
                  backgroundRepeat: "repeat",
                  backgroundSize: "160px 160px",
                  opacity: 0.15,
                  mixBlendMode: "overlay",
                }}
              />

              {/* Border Beam on hover only (hidden on touch devices) */}
              <div className="touch-hide-hover opacity-0 group-hover:opacity-100 transition-opacity duration-[350ms] pointer-events-none absolute inset-0 z-30">
                <BorderBeam
                  size={220}
                  duration={7}
                  colorFrom="#BFD2EE"
                  colorTo="#1A56B8"
                />
              </div>

              {/* Card content: top */}
              <div className="relative z-10 p-6 pb-0 lg:p-7 lg:pb-0 text-left space-y-3 font-normal">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--lp-text-muted)] font-mono font-normal">
                  STEP 03
                </p>
                <p className="text-[clamp(1.25rem,5vw,1.5rem)] lg:text-2xl font-normal tracking-tight text-[var(--lp-text-heading)]">
                  Approve and publish
                </p>
                <p className="text-[15px] lg:text-sm text-[var(--lp-text-body)] font-normal leading-relaxed max-w-sm">
                  One tap verifies quality and schedules publication. AutoPulse posts directly to LinkedIn at peak engagement hours.
                </p>
              </div>

              {/* Mockup 3: flush inside card on mobile, peeking out bottom on desktop */}
              <div className="relative z-10 px-5 pt-5 pb-5 lg:px-6 lg:pt-6 lg:pb-0 overflow-hidden mt-auto">
                <div className="touch-disable-hover bg-[var(--lp-surface-raised)]/90 border border-[var(--lp-border)] backdrop-blur-xl rounded-2xl p-4 lg:p-4.5 text-left transform translate-y-0 lg:translate-y-6 lg:group-hover:translate-y-3 transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]">
                  {/* Header: Ready to publish badge & AI-likeness score pill */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--lp-border-hairline)]">
                    <Badge
                      variant="outline"
                      className="rounded-full text-[11px] font-normal border-[var(--lp-border)] text-[var(--lp-ice)] bg-[var(--lp-surface)] px-2.5 py-0.5 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="size-3" />
                      <span>Ready to publish</span>
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-full text-[11px] font-normal border-[var(--lp-border)] bg-[var(--lp-surface)] text-[var(--lp-text-body)] px-2.5 py-0.5"
                    >
                      AI-likeness: 11 / 100 (Low, passed check)
                    </Badge>
                  </div>

                  {/* Post content snippet */}
                  <div className="py-2.5 space-y-1.5">
                    <p className="text-xs text-[var(--lp-text-heading)] font-normal leading-relaxed">
                      3 practical truths from bootstrapping to $1M ARR with a lean team:
                    </p>
                    <p className="text-[11px] text-[var(--lp-text-muted)] font-normal leading-snug">
                      1. You do not need a complex stack. Simplicity scales faster.
                    </p>
                  </div>

                  {/* Delivery destination with LinkedIn icon */}
                  <div className="pt-2 border-t border-[var(--lp-border-hairline)] flex items-center justify-between text-[11px] text-[var(--lp-text-muted)] font-normal">
                    <div className="flex items-center gap-1.5">
                      <LinkedInIcon className="size-3.5" />
                      <span>Scheduled to LinkedIn</span>
                    </div>
                    <span className="text-[var(--lp-text-muted)] font-normal">10:15 AM</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollRevealItem>
        </ScrollReveal>
      </div>
    </section>
  );
}