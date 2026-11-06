// This component renders a bento grid with Aceternity CardSpotlight interactive pointer-following highlights and scroll reveals.
"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";
import {
  Mail,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  BarChart3,
  Share2,
} from "lucide-react";

// This component presents four distinct capability cards with subtle border highlights
export function BentoGrid() {
  return (
    <section className="bg-paper py-16 md:py-24 border-t border-border-light">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Section title and description with scroll reveal */}
        <ScrollReveal className="max-w-2xl mb-12 sm:mb-16">
          <h2 className="landing-heading text-3xl sm:text-4xl text-ink">
            Built to run on its own, safely
          </h2>
          <p className="mt-3 text-base text-text-muted-light font-normal">
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
            <CardSpotlight className="h-full w-full p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-text-muted-light">
                  <Mail className="w-4 h-4 text-navy" />
                  <span className="text-xs font-normal">Delivery channels</span>
                </div>
                <h3 className="landing-heading text-2xl text-ink mb-3">
                  Approve anywhere
                </h3>
                <p className="text-sm text-text-muted-light font-normal leading-relaxed max-w-md">
                  Review your daily draft by email link or inside your Slack workspace. A single tap approves the draft and schedules it for publication.
                </p>
              </div>

              {/* Visual mock showing email and slack delivery options */}
              <div className="mt-8 pt-6 border-t border-border-light/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-neutral-50/70 border border-border-light/80 space-y-2">
                  <div className="text-xs font-normal text-ink flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-navy" />
                    Email magic link
                  </div>
                  <div className="text-xs text-text-muted-light">
                    Open your inbox on any device, read the draft, and confirm.
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-neutral-50/70 border border-border-light/80 space-y-2">
                  <div className="text-xs font-normal text-ink flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-navy" />
                    Slack message
                  </div>
                  <div className="text-xs text-text-muted-light">
                    Approve directly in your notification channel with one click.
                  </div>
                </div>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>

          {/* Card 2: Built to publish once (spans 5 columns on desktop) */}
          <ScrollRevealItem className="md:col-span-5 flex">
            <CardSpotlight className="h-full w-full p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-text-muted-light">
                  <ShieldCheck className="w-4 h-4 text-navy" />
                  <span className="text-xs font-normal">Idempotent publishing</span>
                </div>
                <h3 className="landing-heading text-2xl text-ink mb-3">
                  Built to publish once
                </h3>
                <p className="text-sm text-text-muted-light font-normal leading-relaxed">
                  A post is not published twice. Strict state checks ensure every draft is executed exactly once to protect your timeline.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-border-light/80">
                <div className="p-4 rounded-xl bg-neutral-50/70 border border-border-light/80 flex items-center justify-between text-xs">
                  <span className="text-text-muted-light">Duplicate safeguard</span>
                  <span className="text-ink font-normal flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-navy" />
                    Enforced
                  </span>
                </div>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>

          {/* Card 3: LinkedIn first with roadmap badges (spans 6 columns on desktop) */}
          <ScrollRevealItem className="md:col-span-6 flex">
            <CardSpotlight className="h-full w-full p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-text-muted-light">
                  <Share2 className="w-4 h-4 text-navy" />
                  <span className="text-xs font-normal">Supported networks</span>
                </div>
                <h3 className="landing-heading text-2xl text-ink mb-3">
                  LinkedIn first
                </h3>
                <p className="text-sm text-text-muted-light font-normal leading-relaxed">
                  Deeply focused on professional LinkedIn publishing at launch, with additional channels in active development.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-border-light/80 flex flex-wrap gap-2.5">
                <Badge className="bg-ink text-white hover:bg-neutral-800 font-normal px-3 py-1 text-xs rounded-full">
                  LinkedIn (Live)
                </Badge>
                <Badge
                  variant="outline"
                  className="border-border-light/80 text-text-muted-light font-normal px-3 py-1 text-xs rounded-full"
                >
                  Instagram (Coming soon)
                </Badge>
                <Badge
                  variant="outline"
                  className="border-border-light/80 text-text-muted-light font-normal px-3 py-1 text-xs rounded-full"
                >
                  Facebook (Coming soon)
                </Badge>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>

          {/* Card 4: Analytics with Coming soon badge (spans 6 columns on desktop) */}
          <ScrollRevealItem className="md:col-span-6 flex">
            <CardSpotlight className="h-full w-full p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-text-muted-light">
                    <BarChart3 className="w-4 h-4 text-navy" />
                    <span className="text-xs font-normal">Performance insights</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-border-light/80 text-text-muted-light font-normal text-xs rounded-full"
                  >
                    Coming soon
                  </Badge>
                </div>
                <h3 className="landing-heading text-2xl text-ink mb-3">
                  Analytics
                </h3>
                <p className="text-sm text-text-muted-light font-normal leading-relaxed">
                  Aggregated impressions, profile visits, and engagement metrics to show which topics generate the highest response.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-border-light/80">
                <div className="p-4 rounded-xl bg-neutral-50/70 border border-border-light/80 flex items-center justify-between text-xs text-text-muted-light">
                  <span>Audience metrics and reach telemetry</span>
                  <span className="font-normal text-ink">In development</span>
                </div>
              </div>
            </CardSpotlight>
          </ScrollRevealItem>
        </ScrollReveal>
      </div>
    </section>
  );
}
