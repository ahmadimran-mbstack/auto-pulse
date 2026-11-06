// This component displays three verified product facts with entrance scroll reveal and hairline dividers.
"use client";

import React from "react";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";

// This component renders the three plain facts row on the paper canvas.
export function ThreeFacts() {
  const facts = [
    {
      metric: "2 ways to approve",
      caption: "Email link or Slack",
    },
    {
      metric: "1 platform at launch",
      caption: "LinkedIn",
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
              <div className="landing-heading text-2xl sm:text-3xl text-ink">
                {fact.metric}
              </div>
              {/* Quiet descriptive caption */}
              <p className="mt-2 text-sm text-text-muted-light font-normal">
                {fact.caption}
              </p>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
