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
        <span className="inline-flex items-center justify-center gap-1.5 text-text-muted-light">
          <GmailIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Email link</span>
          <span className="text-text-muted-light/60">or</span>
          <SlackIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Slack</span>
        </span>
      ),
    },
    {
      metric: "1 platform at launch",
      caption: (
        <span className="inline-flex items-center justify-center gap-1.5 text-text-muted-light">
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
    <section className="relative bg-paper pt-32 sm:pt-40 md:pt-48 pb-16 overflow-hidden">
      {/* Smooth transition fade from dark hero background into paper canvas */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-30 sm:h-38 md:h-44 bg-gradient-to-b from-navy-deep via-navy-deep/40 to-transparent"
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        {/* Hairline bordered container with 60ms stagger entrance */}
        <ScrollReveal
          stagger
          className="border-y border-border-light py-8 sm:py-10 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border-light"
        >
          {facts.map((fact, index) => (
            <ScrollRevealItem
              key={index}
              className={`text-center px-4 ${index > 0 ? "pt-6 md:pt-0" : ""} ${index < facts.length - 1 ? "pb-6 md:pb-0" : ""
                }`}
            >
              {/* Big metric title with regular font weight */}
              <div className="landing-heading text-3xl sm:text-4xl lg:text-[40px] text-ink">
                {fact.metric}
              </div>
              {/* Quiet descriptive caption */}
              <p className="mt-2.5 text-sm sm:text-base text-text-muted-light font-normal flex items-center justify-center">
                {fact.caption}
              </p>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
