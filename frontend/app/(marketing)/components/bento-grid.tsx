// This component renders a bento grid with Aceternity CardSpotlight interactive pointer-following highlights and scroll reveals.
"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";
import {
  ShieldCheck,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import {
  LinkedInIcon,
  SlackIcon,
  GmailIcon,
  InstagramIcon,
  FacebookIcon,
} from "./platform-icons";

// This component presents four distinct capability cards with subtle border highlights
export function BentoGrid() {
  return (
    /* Forced-dark bento grid section on #08090C canvas with 64px mobile vertical spacing */
    <section
      className="bg-[var(--lp-bg)] py-16 lg:py-24 border-t border-[var(--lp-border-hairline)]"
    >
      {/* Consistent 20px mobile container padding */}
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        {/* Section title and description with scroll reveal */}
        <ScrollReveal className="max-w-3xl mb-10 lg:mb-16">
          <p className="landing-heading text-[clamp(1.75rem,7vw,2.25rem)] lg:text-4xl text-[var(--lp-text-heading)]">
            Built to run on its own, safely
          </p>
          <p className="mt-3 text-[15px] lg:text-lg text-[var(--lp-text-muted)] font-normal">
            Every safeguard is designed so you maintain full control of your reputation.
          </p>
        </ScrollReveal>

        {/* Responsive Bento Grid layout with 60ms staggered reveal */}
        <ScrollReveal
          stagger
          className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch"
        >
          {/* Card 1: Approve anywhere (Wide card, spans 7 columns on desktop) */}
          <ScrollRevealItem className="md:col-span-7 flex">
            <CardSpotlight className="h-full w-full p-5 sm:p-6 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-[var(--lp-text-muted)]">
                  <div className="flex items-center gap-1">
                    <GmailIcon className="w-3.5 h-3.5" />
                    <SlackIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-normal">Delivery channels</span>
                </div>
                <h3 className="landing-heading text-[clamp(1.5rem,6vw,1.875rem)] lg:text-3xl text-[var(--lp-text-heading)] mb-3">
                  Approve anywhere
                </h3>
                <p className="text-[15px] lg:text-base text-[var(--lp-text-body)] font-normal leading-relaxed max-w-md">
                  Review your daily draft by email link or inside your Slack workspace. A single tap approves the draft and schedules it for publication.
                </p>
              </div>

              {/* Visual mock showing email and slack delivery options */}
              <div className="mt-6 lg:mt-8 pt-5 lg:pt-6 border-t border-[var(--lp-border-hairline)] grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[var(--lp-surface-raised)] border border-[var(--lp-border)] space-y-2">
                  <div className="text-sm font-normal text-[var(--lp-text-heading)] flex items-center gap-2">
                    <GmailIcon className="w-4 h-4 shrink-0" />
                    <span>Email magic link</span>
                  </div>
                  <div className="text-xs text-[var(--lp-text-muted)]">
                    Open your inbox on any device, read the draft, and confirm.
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--lp-surface-raised)] border border-[var(--lp-border)] space-y-2">
                  <div className="text-sm font-normal text-[var(--lp-text-heading)] flex items-center gap-2">
                    <SlackIcon className="w-4 h-4 shrink-0" />
                    <span>Slack message</span>
                  </div>
                  <div className="text-xs text-[var(--lp-text-muted)]">
                    Approve directly in your notification channel with one click.
                  </div>
                </div>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>

          {/* Card 2: Built to publish once (spans 5 columns on desktop) */}
          <ScrollRevealItem className="md:col-span-5 flex">
            <CardSpotlight className="h-full w-full p-5 sm:p-6 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-[var(--lp-text-muted)]">
                  <ShieldCheck className="w-4 h-4 text-[var(--lp-ice)]" />
                  <span className="text-xs font-normal">Idempotent publishing</span>
                </div>
                <h3 className="landing-heading text-[clamp(1.5rem,6vw,1.875rem)] lg:text-3xl text-[var(--lp-text-heading)] mb-3">
                  Built to publish once
                </h3>
                <p className="text-[15px] lg:text-base text-[var(--lp-text-body)] font-normal leading-relaxed">
                  A post is not published twice. Strict state checks ensure every draft is executed exactly once to protect your timeline.
                </p>
              </div>

              <div className="mt-6 lg:mt-8 pt-5 lg:pt-6 border-t border-[var(--lp-border-hairline)]">
                <div className="p-4 rounded-xl bg-[var(--lp-surface-raised)] border border-[var(--lp-border)] flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--lp-text-muted)]">Duplicate safeguard</span>
                  <span className="text-[var(--lp-text-heading)] font-normal flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[var(--lp-ice)]" />
                    Enforced
                  </span>
                </div>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>

          {/* Card 3: LinkedIn first with roadmap badges (spans 6 columns on desktop) */}
          <ScrollRevealItem className="md:col-span-6 flex">
            <CardSpotlight className="h-full w-full p-5 sm:p-6 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-[var(--lp-text-muted)]">
                  <LinkedInIcon className="w-4 h-4" />
                  <span className="text-xs font-normal">Supported networks</span>
                </div>
                <h3 className="landing-heading text-[clamp(1.5rem,6vw,1.875rem)] lg:text-3xl text-[var(--lp-text-heading)] mb-3">
                  LinkedIn first
                </h3>
                <p className="text-[15px] lg:text-base text-[var(--lp-text-body)] font-normal leading-relaxed">
                  Deeply focused on professional LinkedIn publishing at launch, with additional channels in active development.
                </p>
              </div>

              <div className="mt-6 lg:mt-8 pt-5 lg:pt-6 border-t border-[var(--lp-border-hairline)] flex flex-wrap gap-2.5">
                <Badge className="bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] font-normal px-3 py-1.5 text-xs rounded-full flex items-center gap-1.5">
                  <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>LinkedIn (Live)</span>
                </Badge>
                <Badge
                  variant="outline"
                  className="border-[var(--lp-border)] bg-[var(--lp-surface-raised)] text-[var(--lp-text-body)] font-normal px-3 py-1.5 text-xs rounded-full flex items-center gap-1.5"
                >
                  <InstagramIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Instagram (Coming soon)</span>
                </Badge>
                <Badge
                  variant="outline"
                  className="border-[var(--lp-border)] bg-[var(--lp-surface-raised)] text-[var(--lp-text-body)] font-normal px-3 py-1.5 text-xs rounded-full flex items-center gap-1.5"
                >
                  <FacebookIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Facebook (Coming soon)</span>
                </Badge>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>

          {/* Card 4: Analytics with Coming soon badge (spans 6 columns on desktop) */}
          <ScrollRevealItem className="md:col-span-6 flex">
            <CardSpotlight className="h-full w-full p-5 sm:p-6 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2 text-[var(--lp-text-muted)]">
                    <BarChart3 className="w-4 h-4 text-[var(--lp-ice)]" />
                    <span className="text-xs font-normal">Performance insights</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-[var(--lp-border)] bg-[var(--lp-surface-raised)] text-[var(--lp-text-body)] font-normal text-xs rounded-full"
                  >
                    Coming soon
                  </Badge>
                </div>
                <h3 className="landing-heading text-[clamp(1.5rem,6vw,1.875rem)] lg:text-3xl text-[var(--lp-text-heading)] mb-3">
                  Analytics
                </h3>
                <p className="text-[15px] lg:text-base text-[var(--lp-text-body)] font-normal leading-relaxed">
                  Aggregated impressions, profile visits, and engagement metrics to show which topics generate the highest response.
                </p>
              </div>

              <div className="mt-6 lg:mt-8 pt-5 lg:pt-6 border-t border-[var(--lp-border-hairline)]">
                <div className="p-4 rounded-xl bg-[var(--lp-surface-raised)] border border-[var(--lp-border)] flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--lp-text-muted)]">
                  <span>Audience metrics and reach telemetry</span>
                  <span className="font-normal text-[var(--lp-text-heading)]">In development</span>
                </div>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>
        </ScrollReveal>
      </div>
    </section>
  );
}
