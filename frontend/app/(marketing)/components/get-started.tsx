// Redesigned "Get started in three steps" section with premium dark cards,
// dithered grain gradients, Magic UI MagicCard spotlight, BorderBeam on hover,
// BlurFade reveal, and frosted glass product mockups.
// Strict font-normal rule: zero heavy or medium weights anywhere in this component.
"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MagicCard } from "@/components/ui/magic-card";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { LinkedInIcon, SlackIcon, GmailIcon } from "./platform-icons";
import { CheckCircle2, Clock, Send, Sparkles } from "lucide-react";

// Subtle SVG film grain noise overlay matching Section 2 auth panel
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

export function GetStarted() {
  return (
    <section
      id="how-it-works"
      className="bg-paper py-20 sm:py-28 border-t border-border-light text-foreground font-normal"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Section header: text-4xl md:text-5xl, font-normal, tracking-tight */}
        <div className="max-w-2xl mb-12 sm:mb-16 text-left font-normal">
          <BlurFade delay={0.05} inView>
            <h2 className="text-4xl md:text-5xl font-normal tracking-tight text-ink">
              Get started in three steps
            </h2>
          </BlurFade>
          <BlurFade delay={0.1} inView>
            <p className="mt-3 text-base sm:text-lg text-text-muted-light font-normal leading-relaxed">
              Setup takes minutes. AutoPulse finds topics, drafts posts, and never publishes without your explicit approval.
            </p>
          </BlurFade>
        </div>

        {/* 3 equal columns on lg, stacked on mobile, gap-5 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {/* Card 1: Step 01 - Indigo / Violet */}
          <BlurFade delay={0.1} inView className="h-full">
            <div className="relative h-full rounded-3xl overflow-hidden group">
              <MagicCard
                className="h-full min-h-[520px] rounded-3xl border border-white/10 overflow-hidden flex flex-col justify-between"
                gradientColor="rgba(139, 124, 246, 0.16)"
                gradientSize={280}
                backgroundClassName="bg-[#05050A]"
              >
                {/* Indigo/Violet background gradient */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      radial-gradient(circle 480px at 75% 15%, rgba(59, 47, 160, 0.75) 0%, transparent 70%),
                      radial-gradient(circle 320px at 85% 25%, rgba(139, 124, 246, 0.45) 0%, transparent 60%),
                      radial-gradient(circle 400px at 15% 85%, rgba(11, 27, 77, 0.6) 0%, transparent 70%)
                    `,
                  }}
                />

                {/* Bottom dark fade */}
                <div
                  className="pointer-events-none absolute inset-0 z-[1]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to top, #05050A 0%, rgba(5, 5, 10, 0.75) 40%, transparent 100%)",
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

                {/* Border Beam on hover only */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none absolute inset-0 z-30">
                  <BorderBeam
                    size={220}
                    duration={7}
                    colorFrom="#8B7CF6"
                    colorTo="#3B2FA0"
                  />
                </div>

                {/* Card content: top */}
                <div className="relative z-10 p-7 pb-0 text-left space-y-3 font-normal">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50 font-mono font-normal">
                    STEP 01
                  </p>
                  <h3 className="text-2xl md:text-3xl font-normal tracking-tight text-white">
                    Connect your LinkedIn
                  </h3>
                  <p className="text-sm text-white/60 font-normal leading-relaxed max-w-sm">
                    Authorize your profile securely with standard OAuth permissions. We never post without your explicit approval.
                  </p>
                </div>

                {/* Mockup 1: Profile setup snippet peeking out bottom */}
                <div className="relative z-10 px-6 pt-6 overflow-hidden mt-auto">
                  <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-4.5 text-left transform translate-y-6 group-hover:translate-y-3 transition-transform duration-300 ease-out shadow-2xl">
                    {/* Mockup header */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-[#0077B5]/20 border border-[#0077B5]/40 flex items-center justify-center shrink-0">
                          <LinkedInIcon className="size-4" />
                        </div>
                        <div>
                          <div className="text-xs text-white font-normal">Alex Rivera</div>
                          <div className="text-[11px] text-white/50 font-normal">Founder and Operator</div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full text-[11px] font-normal border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-2 py-0.5"
                      >
                        Connected
                      </Badge>
                    </div>

                    {/* Topic chips */}
                    <div className="pt-3 space-y-2">
                      <div className="text-[11px] text-white/50 uppercase tracking-wider font-normal">
                        Active topics
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant="outline"
                          className="rounded-full text-xs font-normal border-white/15 bg-white/5 text-white/85 px-2.5 py-0.5"
                        >
                          B2B SaaS
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full text-xs font-normal border-white/15 bg-white/5 text-white/85 px-2.5 py-0.5"
                        >
                          Founder journey
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full text-xs font-normal border-white/15 bg-white/5 text-white/85 px-2.5 py-0.5"
                        >
                          Growth
                        </Badge>
                      </div>
                    </div>

                    {/* Tone pill & prompt sample */}
                    <div className="pt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50 font-normal">Tone</span>
                        <span className="text-xs font-normal text-indigo-300 bg-indigo-500/15 border border-indigo-500/25 px-2 py-0.5 rounded-full">
                          Direct and candid
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-white/70 font-normal leading-relaxed">
                        Prompt: Focus on real engineering milestones and metrics with zero generic platitudes.
                      </div>
                    </div>
                  </div>
                </div>
              </MagicCard>
            </div>
          </BlurFade>

          {/* Card 2: Step 02 - Deep Teal / Blue */}
          <BlurFade delay={0.2} inView className="h-full">
            <div className="relative h-full rounded-3xl overflow-hidden group">
              <MagicCard
                className="h-full min-h-[520px] rounded-3xl border border-white/10 overflow-hidden flex flex-col justify-between"
                gradientColor="rgba(14, 116, 144, 0.18)"
                gradientSize={280}
                backgroundClassName="bg-[#05050A]"
              >
                {/* Deep Teal / Blue background gradient */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      radial-gradient(circle 480px at 70% 15%, rgba(13, 92, 117, 0.8) 0%, transparent 70%),
                      radial-gradient(circle 340px at 85% 30%, rgba(6, 182, 212, 0.4) 0%, transparent 60%),
                      radial-gradient(circle 420px at 15% 85%, rgba(14, 45, 95, 0.65) 0%, transparent 70%)
                    `,
                  }}
                />

                {/* Bottom dark fade */}
                <div
                  className="pointer-events-none absolute inset-0 z-[1]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to top, #05050A 0%, rgba(5, 5, 10, 0.75) 40%, transparent 100%)",
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

                {/* Border Beam on hover only */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none absolute inset-0 z-30">
                  <BorderBeam
                    size={220}
                    duration={7}
                    colorFrom="#06B6D4"
                    colorTo="#0E5C75"
                  />
                </div>

                {/* Card content: top */}
                <div className="relative z-10 p-7 pb-0 text-left space-y-3 font-normal">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50 font-mono font-normal">
                    STEP 02
                  </p>
                  <h3 className="text-2xl md:text-3xl font-normal tracking-tight text-white">
                    Receive your morning draft
                  </h3>
                  <p className="text-sm text-white/60 font-normal leading-relaxed max-w-sm">
                    AutoPulse researches trending discussions in your niche and delivers a polished draft to your inbox or Slack.
                  </p>
                </div>

                {/* Mockup 2: Notification card with preview and buttons peeking out bottom */}
                <div className="relative z-10 px-6 pt-6 overflow-hidden mt-auto">
                  <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-4.5 text-left transform translate-y-6 group-hover:translate-y-3 transition-transform duration-300 ease-out shadow-2xl">
                    {/* Notification header */}
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-md bg-[#4A154B]/30 border border-[#4A154B]/50 flex items-center justify-center shrink-0">
                          <SlackIcon className="size-3.5" />
                        </div>
                        <span className="text-xs text-white/90 font-normal">
                          AutoPulse drafted today&apos;s post
                        </span>
                      </div>
                      <span className="text-[11px] text-white/50 font-normal">9:00 AM</span>
                    </div>

                    {/* 2-line post preview */}
                    <div className="py-3">
                      <p className="text-xs text-white/80 font-normal leading-relaxed line-clamp-2">
                        Great software products rarely win on feature count alone. They win because they remove friction from one essential daily task.
                      </p>
                    </div>

                    {/* Action buttons: Approve, Edit in dashboard */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-8 px-3.5 rounded-lg bg-white text-neutral-950 hover:bg-neutral-200 font-normal text-xs"
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 rounded-lg border-white/15 bg-white/5 text-white/90 hover:bg-white/10 font-normal text-xs"
                      >
                        Edit in dashboard
                      </Button>
                    </div>
                  </div>
                </div>
              </MagicCard>
            </div>
          </BlurFade>

          {/* Card 3: Step 03 - Warm Orange into Indigo */}
          <BlurFade delay={0.3} inView className="h-full">
            <div className="relative h-full rounded-3xl overflow-hidden group">
              <MagicCard
                className="h-full min-h-[520px] rounded-3xl border border-white/10 overflow-hidden flex flex-col justify-between"
                gradientColor="rgba(234, 88, 12, 0.16)"
                gradientSize={280}
                backgroundClassName="bg-[#05050A]"
              >
                {/* Warm Orange into Indigo background gradient */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      radial-gradient(circle 460px at 20% 15%, rgba(234, 88, 12, 0.75) 0%, transparent 65%),
                      radial-gradient(circle 380px at 80% 35%, rgba(59, 47, 160, 0.75) 0%, transparent 65%),
                      radial-gradient(circle 360px at 20% 85%, rgba(11, 27, 77, 0.6) 0%, transparent 70%)
                    `,
                  }}
                />

                {/* Bottom dark fade */}
                <div
                  className="pointer-events-none absolute inset-0 z-[1]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to top, #05050A 0%, rgba(5, 5, 10, 0.75) 40%, transparent 100%)",
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

                {/* Border Beam on hover only */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none absolute inset-0 z-30">
                  <BorderBeam
                    size={220}
                    duration={7}
                    colorFrom="#EA580C"
                    colorTo="#4F46E5"
                  />
                </div>

                {/* Card content: top */}
                <div className="relative z-10 p-7 pb-0 text-left space-y-3 font-normal">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50 font-mono font-normal">
                    STEP 03
                  </p>
                  <h3 className="text-2xl md:text-3xl font-normal tracking-tight text-white">
                    Approve and publish
                  </h3>
                  <p className="text-sm text-white/60 font-normal leading-relaxed max-w-sm">
                    One tap verifies quality and schedules publication. AutoPulse posts directly to LinkedIn at peak engagement hours.
                  </p>
                </div>

                {/* Mockup 3: Ready to publish LinkedIn post with AI-likeness pill peeking out bottom */}
                <div className="relative z-10 px-6 pt-6 overflow-hidden mt-auto">
                  <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-4.5 text-left transform translate-y-6 group-hover:translate-y-3 transition-transform duration-300 ease-out shadow-2xl">
                    {/* Header: Ready to publish badge & AI-likeness score pill */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                      <Badge
                        variant="outline"
                        className="rounded-full text-[11px] font-normal border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="size-3" />
                        <span>Ready to publish</span>
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full text-[11px] font-normal border-white/15 bg-white/5 text-white/80 px-2.5 py-0.5"
                      >
                        AI-likeness: 11 / 100 (Low, passed check)
                      </Badge>
                    </div>

                    {/* Post content snippet */}
                    <div className="py-2.5 space-y-1.5">
                      <p className="text-xs text-white/90 font-normal leading-relaxed">
                        3 practical truths from bootstrapping to $1M ARR with a lean team:
                      </p>
                      <p className="text-[11px] text-white/60 font-normal leading-snug">
                        1. You do not need a complex stack. Simplicity scales faster.
                      </p>
                    </div>

                    {/* Delivery destination with LinkedIn icon */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60 font-normal">
                      <div className="flex items-center gap-1.5">
                        <LinkedInIcon className="size-3.5" />
                        <span>Scheduled to LinkedIn</span>
                      </div>
                      <span className="text-white/40 font-normal">10:15 AM</span>
                    </div>
                  </div>
                </div>
              </MagicCard>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}