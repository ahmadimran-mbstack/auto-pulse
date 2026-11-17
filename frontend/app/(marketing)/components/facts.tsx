// This component displays three verified product facts with entrance scroll reveal and hairline dividers.
"use client";

import React from "react";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";
import { LinkedInIcon, SlackIcon, GmailIcon } from "./platform-icons";

// This component renders the three plain facts row on the paper canvas.
export function ThreeFacts() {
  const facts = [
    {
      metric: "2 ways to approve",
      caption: (
        <span className="inline-flex items-center justify-center gap-1.5 text-[var(--lp-text-muted)]">
          <GmailIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Email link</span>
          <span className="text-[var(--lp-text-muted)]/70">or</span>
          <SlackIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Slack</span>
        </span>
      ),
    },
    {
      metric: "1 platform at launch",
      caption: (
        <span className="inline-flex items-center justify-center gap-1.5 text-[var(--lp-text-muted)]">
          <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
          <span>LinkedIn</span>
        </span>
      ),
    },
    {
      metric: "Checked before you see it",
      caption: "Every draft gets an AI-writing score",
    },
  ];

  return (
    /* Three-facts section on forced-dark #08090C canvas with hairline dividers */
    <section
      className="relative bg-[var(--lp-bg)] py-16 md:pt-40 lg:pt-48 lg:pb-16 overflow-hidden"
    >
      {/* Consistent 20px mobile container padding */}
      <div className="relative z-10 max-w-5xl mx-auto px-5 lg:px-6">
        {/* Hairline bordered container with 60ms stagger entrance */}
        <ScrollReveal
          stagger
          className="border-y border-[var(--lp-border-hairline)] py-8 lg:py-10 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--lp-border-hairline)]"
        >
          {facts.map((fact, index) => (
            <ScrollRevealItem
              key={index}
              className={`text-center px-4 ${index > 0 ? "pt-6 md:pt-0" : ""} ${index < facts.length - 1 ? "pb-6 md:pb-0" : ""
                }`}
            >
              {/* Big metric title scaled smoothly on mobile with regular font weight */}
              <div className="landing-heading text-[clamp(1.625rem,6.5vw,2.25rem)] lg:text-[40px] text-[var(--lp-text-heading)]">
                {fact.metric}
              </div>
              {/* Quiet descriptive caption at least 15px on mobile */}
              <p className="mt-2.5 text-[15px] lg:text-base text-[var(--lp-text-muted)] font-normal flex items-center justify-center">
                {fact.caption}
              </p>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
