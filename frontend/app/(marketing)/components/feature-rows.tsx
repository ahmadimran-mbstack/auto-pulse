// This component displays four alternating feature rows with 6-second auto-advancing progress lines and crossfading 4-degree tilt cards.
"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GrainyPanel, type GrainyPalette } from "./grainy-panel";
import { TiltCard } from "./tilt-card";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";
import {
  MockScoreMeterCard,
  MockSlackCard,
  MockLinkedInStatusCard,
} from "./mock-cards";

// Feature data structure containing headline, eyebrow badge, panel configuration, and three sub-rows
interface FeatureItem {
  id: string;
  badge: string;
  headline: string;
  panelVariant: GrainyPalette;
  panelAngle?: number;
  rows: {
    title: string;
    description: string;
  }[];
}

const features: FeatureItem[] = [
  {
    id: "topic-finder",
    badge: "Topic finder",
    headline: "Finds what is worth posting about",
    panelVariant: "navy-ice",
    panelAngle: 120,
    rows: [
      {
        title: "Reads your profile and past posts",
        description:
          "Learns what topics you discuss, what resonates with your readers, and what matches your professional background.",
      },
      {
        title: "Searches the web for current topics",
        description:
          "Scans relevant industry news and active online discussions each morning to surface timely angles.",
      },
      {
        title: "Avoids repeating what you already posted",
        description:
          "Maintains a memory of your published archive so you never share duplicate thoughts or repeated themes.",
      },
    ],
  },
  {
    id: "drafter",
    badge: "Drafter",
    headline: "Writes the first draft for you",
    panelVariant: "ice-navy",
    panelAngle: 210,
    rows: [
      {
        title: "Uses your role, audience and goals",
        description:
          "Frames each draft around the specific industry peers and prospective clients you want to reach.",
      },
      {
        title: "Follows proven hook styles",
        description:
          "Starts with crisp opening statements that catch attention without using gimmicks.",
      },
      {
        title: "Keeps your voice settings",
        description:
          "Respects your guidance on whether you prefer concise analysis, practical tutorials, or structured reflections.",
      },
    ],
  },
  {
    id: "checker",
    badge: "Checker",
    headline: "Checks every draft before you see it",
    panelVariant: "ink-glow",
    rows: [
      {
        title: "Scores the draft for AI-sounding writing",
        description:
          "Measures vocabulary predictability and sentence patterns against an objective detection benchmark.",
      },
      {
        title: "Rewrites in a loop until the score is under 15 out of 100",
        description:
          "Performs continuous revision passes until the draft sounds natural and distinct.",
      },
      {
        title: "Only passing drafts reach you",
        description:
          "If a draft fails to pass the strict quality bar, it is discarded rather than delivered to your queue.",
      },
    ],
  },
  {
    id: "approval",
    badge: "Approval and publishing",
    headline: "You approve, it publishes",
    panelVariant: "deep-blue",
    panelAngle: 145,
    rows: [
      {
        title: "Approve by email link or in Slack",
        description:
          "Review drafts on your phone or computer and confirm publication with one tap.",
      },
      {
        title: "Publishes to LinkedIn after approval",
        description:
          "Connects securely to your verified LinkedIn account and posts only after explicit approval.",
      },
      {
        title: "Tells you when your LinkedIn connection needs renewing",
        description:
          "Sends timely email notifications before the 60-day connection token expires so posting never stops.",
      },
    ],
  },
];

// Helper to render responsive mock cards inside each feature panel based on active item
function FeatureMockContent({
  featureId,
  activeRowIndex,
}: {
  featureId: string;
  activeRowIndex: number;
}) {
  if (featureId === "topic-finder") {
    const topicSamples = [
      {
        title: "Why early engineering teams should document architectural trade-offs in public notes.",
        tag: "Engineering Culture",
        source: "Profile resonance and recent dev blogs",
      },
      {
        title: "Three non-obvious bottlenecks when scaling background task workers in production.",
        tag: "System Design",
        source: "Web trend in systems engineering",
      },
      {
        title: "How to run customer interviews without asking leading product questions.",
        tag: "Product Strategy",
        source: "Zero archive overlap with last 90 days",
      },
    ];

    const currentTopic = topicSamples[activeRowIndex] || topicSamples[0];

    return (
      <Card className="bg-white text-ink rounded-2xl border border-border-light p-5 sm:p-6 max-w-sm w-full mx-auto shadow-none">
        <div className="flex items-center justify-between pb-3 border-b border-border-light">
          <span className="text-xs text-text-muted-light">Discovered topic</span>
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-border-light text-navy bg-ice/20"
          >
            Ready for drafting
          </Badge>
        </div>
        <div className="py-3.5 space-y-2">
          <div className="text-[11px] font-normal text-text-muted-light uppercase tracking-wider">
            Selected concept
          </div>
          <p className="text-sm font-normal text-ink leading-snug">
            {currentTopic.title}
          </p>
        </div>
        <div className="pt-3 border-t border-border-light flex items-center justify-between text-xs text-text-muted-light">
          <span>{currentTopic.tag}</span>
          <span className="text-[11px]">{currentTopic.source}</span>
        </div>
      </Card>
    );
  }

  if (featureId === "drafter") {
    const draftSamples = [
      {
        hook: "Role: Founder & Architect",
        text: "The hardest part of shipping is not writing the code. It is deciding what not to build today so your team can deliver what truly matters.",
        words: "112 words",
      },
      {
        hook: "Hook style: Contrarian observation",
        text: "Most documentation gets written for the team you have today, not the engineer joining six months from now. That is why codebases feel unfamiliar.",
        words: "128 words",
      },
      {
        hook: "Voice: Direct and analytical",
        text: "Before adding an extra abstraction, ask what problem it solves right now. Premature flexibility is one of the highest taxes in software.",
        words: "104 words",
      },
    ];

    const currentDraft = draftSamples[activeRowIndex] || draftSamples[0];

    return (
      <Card className="bg-white text-ink rounded-2xl border border-border-light p-5 sm:p-6 max-w-sm w-full mx-auto shadow-none">
        <div className="flex items-center justify-between pb-3 border-b border-border-light">
          <span className="text-xs text-text-muted-light">{currentDraft.hook}</span>
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-border-light text-navy bg-ice/20"
          >
            Draft ready
          </Badge>
        </div>
        <div className="py-3.5 space-y-2">
          <div className="text-[11px] font-normal text-text-muted-light uppercase tracking-wider">
            Draft preview
          </div>
          <p className="text-sm font-normal text-ink leading-relaxed">
            {currentDraft.text}
          </p>
        </div>
        <div className="pt-3 border-t border-border-light flex items-center justify-between text-xs text-text-muted-light">
          <span>Format: Short essay</span>
          <span>{currentDraft.words}</span>
        </div>
      </Card>
    );
  }

  if (featureId === "checker") {
    return <MockScoreMeterCard />;
  }

  // Feature d (Approval & Publishing)
  if (activeRowIndex === 2) {
    return <MockLinkedInStatusCard />;
  }

  return <MockSlackCard />;
}

// Single feature row block with 6-second auto-advance timer, progress line, and crossfading UI
function FeatureRowBlock({
  feature,
  isReversed,
}: {
  feature: FeatureItem;
  isReversed: boolean;
}) {
  const [activeRow, setActiveRow] = useState(0);
  const [progressKey, setProgressKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auto-advance active row every 6 seconds unless reduced motion is preferred
  useEffect(() => {
    if (reducedMotion) return;

    const timer = setInterval(() => {
      setActiveRow((prev) => (prev + 1) % feature.rows.length);
      setProgressKey((k) => k + 1);
    }, 6000);

    return () => clearInterval(timer);
  }, [feature.rows.length, reducedMotion, activeRow]);

  // Handle manual selection on row click
  const handleSelectRow = (idx: number) => {
    setActiveRow(idx);
    setProgressKey((k) => k + 1);
  };

  return (
    <ScrollReveal>
      <div
        className={`grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center py-12 md:py-20 ${
          isReversed ? "lg:flex-row-reverse" : ""
        }`}
      >
        {/* Panel column: rounded-3xl container holding the 4-degree tilt mock UI card */}
        <div
          className={`lg:col-span-6 w-full ${
            isReversed ? "lg:order-2" : "lg:order-1"
          }`}
        >
          <GrainyPanel
            variant={feature.panelVariant}
            angle={feature.panelAngle}
            className="min-h-[380px] sm:min-h-[420px]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRow}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="w-full max-w-sm mx-auto"
              >
                <TiltCard maxTilt={4}>
                  <FeatureMockContent
                    featureId={feature.id}
                    activeRowIndex={activeRow}
                  />
                </TiltCard>
              </motion.div>
            </AnimatePresence>
          </GrainyPanel>
        </div>

        {/* Copy column: eyebrow, headline, and list of 3 rows */}
        <div
          className={`lg:col-span-6 w-full ${
            isReversed ? "lg:order-1" : "lg:order-2"
          }`}
        >
          {/* Eyebrow badge with subtle border */}
          <Badge
            variant="outline"
            className="rounded-full text-xs font-normal border-border-light text-navy bg-ice/20 mb-4 px-3 py-1"
          >
            {feature.badge}
          </Badge>

          {/* Quiet headline */}
          <h2 className="landing-heading text-3xl sm:text-4xl text-ink mb-6">
            {feature.headline}
          </h2>

          {/* List of 3 rows separated by hairlines */}
          <div className="border-t border-border-light divide-y divide-border-light">
            {feature.rows.map((row, idx) => {
              const isActive = activeRow === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectRow(idx)}
                  className="w-full text-left py-4 sm:py-5 group cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/50 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-base sm:text-lg font-normal transition-colors ${
                        isActive
                          ? "text-ink"
                          : "text-text-muted-light group-hover:text-ink"
                      }`}
                    >
                      {row.title}
                    </span>
                  </div>

                  {/* Description shown for active row */}
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className="mt-2 text-sm text-text-muted-light font-normal leading-relaxed overflow-hidden"
                    >
                      {row.description}
                    </motion.p>
                  )}

                  {/* 1px progress indicator filling over 6 seconds */}
                  <div className="mt-3 w-full h-[1px] bg-border-light relative overflow-hidden">
                    {isActive && (
                      <motion.div
                        key={progressKey}
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{
                          duration: reducedMotion ? 0 : 6,
                          ease: "linear",
                        }}
                        className="absolute left-0 top-0 bottom-0 bg-ink"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollReveal>
  );
}

// Main FeatureRows section container
export function FeatureRows() {
  return (
    <section id="features" className="bg-paper py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 divide-y divide-border-light">
        {features.map((feature, index) => (
          <FeatureRowBlock
            key={feature.id}
            feature={feature}
            isReversed={index % 2 === 1}
          />
        ))}
      </div>
    </section>
  );
}
