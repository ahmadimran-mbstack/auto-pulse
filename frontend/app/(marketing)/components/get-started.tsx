// This component displays the three onboarding steps with numbered headers, scroll reveals, and 4-degree tilt cards.
"use client";

import React from "react";
import {
  MockLinkedInStatusCard,
  MockOnboardingStepCard,
  MockDraftCard,
} from "./mock-cards";
import { TiltCard } from "./tilt-card";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";

// This component renders the three-step onboarding breakdown on paper canvas.
export function GetStarted() {
  const steps = [
    {
      number: "1.",
      title: "Connect your LinkedIn",
      description:
        "Authorize your profile securely with standard OAuth permissions so AutoPulse can deliver approved posts.",
      card: (
        <TiltCard maxTilt={4}>
          <MockLinkedInStatusCard />
        </TiltCard>
      ),
    },
    {
      number: "2.",
      title: "Tell AutoPulse about you and your audience",
      description:
        "Define your industry niche, your target reader profile, and the voice settings that match your style.",
      card: (
        <TiltCard maxTilt={4}>
          <MockOnboardingStepCard />
        </TiltCard>
      ),
    },
    {
      number: "3.",
      title: "Approve your first post",
      description:
        "AutoPulse drafts your initial post, checks the AI writing score, and sends you an email or Slack notification to approve.",
      card: (
        <TiltCard maxTilt={4}>
          <MockDraftCard />
        </TiltCard>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="bg-paper py-16 md:py-24 border-t border-border-light">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Section title and subtitle with scroll reveal */}
        <ScrollReveal className="max-w-2xl mb-12 sm:mb-16">
          <h2 className="landing-heading text-3xl sm:text-4xl text-ink">
            Get started in three steps
          </h2>
          <p className="mt-3 text-base text-text-muted-light font-normal">
            Set up takes minutes. Nothing goes live without your explicit approval.
          </p>
        </ScrollReveal>

        {/* Three step columns with 60ms staggered reveal */}
        <ScrollReveal
          stagger
          className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10 items-start"
        >
          {steps.map((step, idx) => (
            <ScrollRevealItem key={idx} className="flex flex-col space-y-6">
              <div>
                <div className="landing-heading text-3xl text-neutral-400 mb-2">
                  {step.number}
                </div>
                <h3 className="landing-heading text-xl text-ink mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-text-muted-light font-normal leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Step visual mock card wrapped in subtle 4-degree tilt */}
              <div className="pt-2 w-full">
                {step.card}
              </div>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}
