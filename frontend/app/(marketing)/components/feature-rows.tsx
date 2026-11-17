// This component displays four alternating feature rows with 6-second auto-advancing progress lines and crossfading 4-degree tilt cards.
"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);
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
import { LinkedInIcon, SlackIcon, GmailIcon } from "./platform-icons";

// Feature data structure containing step number, eyebrow badge, headline, panel configuration, and three sub-rows
interface FeatureItem {
  id: string;
  stepNumber: string;
  badge: string;
  headline: string;
  panelVariant: GrainyPalette;
  panelAngle?: number;
  rows: {
    title: React.ReactNode;
    description: string;
  }[];
}

const features: FeatureItem[] = [
  {
    id: "topic-finder",
    stepNumber: "01",
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
    stepNumber: "02 and 03",
    badge: "Hook strategist and Writer",
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
    stepNumber: "04",
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
    stepNumber: "05",
    badge: "Approval and publishing",
    headline: "You approve, it publishes",
    panelVariant: "deep-blue",
    panelAngle: 145,
    rows: [
      {
        title: (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <GmailIcon className="w-4 h-4 shrink-0" />
              <span>Approve by email link</span>
            </span>
            <span>or in</span>
            <span className="inline-flex items-center gap-1">
              <SlackIcon className="w-4 h-4 shrink-0" />
              <span>Slack</span>
            </span>
          </span>
        ),
        description:
          "Review drafts on your phone or computer and confirm publication with one tap.",
      },
      {
        title: (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span>Publishes to</span>
            <span className="inline-flex items-center gap-1">
              <LinkedInIcon className="w-4 h-4 shrink-0" />
              <span>LinkedIn</span>
            </span>
            <span>after approval</span>
          </span>
        ),
        description:
          "Connects securely to your verified LinkedIn account and posts only after explicit approval.",
      },
      {
        title: (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span>Tells you when your</span>
            <span className="inline-flex items-center gap-1">
              <LinkedInIcon className="w-4 h-4 shrink-0" />
              <span>LinkedIn</span>
            </span>
            <span>connection needs renewing</span>
          </span>
        ),
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
      <Card className="bg-[var(--lp-surface)] text-[var(--lp-text-body)] rounded-2xl border border-[var(--lp-border)] shadow-[var(--lp-highlight-top)] p-5 sm:p-6 max-w-sm w-full mx-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--lp-border-hairline)]">
          <span className="text-xs text-[var(--lp-text-muted)]">Discovered topic</span>
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-[var(--lp-border)] text-[var(--lp-ice)] bg-[var(--lp-surface-raised)]"
          >
            Ready for drafting
          </Badge>
        </div>
        <div className="py-3.5 space-y-2">
          <div className="text-[11px] font-normal text-[var(--lp-text-muted)] uppercase tracking-wider">
            Selected concept
          </div>
          <p className="text-sm font-normal text-[var(--lp-text-heading)] leading-snug">
            {currentTopic.title}
          </p>
        </div>
        <div className="pt-3 border-t border-[var(--lp-border-hairline)] flex items-center justify-between text-xs text-[var(--lp-text-muted)]">
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
      <Card className="bg-[var(--lp-surface)] text-[var(--lp-text-body)] rounded-2xl border border-[var(--lp-border)] shadow-[var(--lp-highlight-top)] p-5 sm:p-6 max-w-sm w-full mx-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--lp-border-hairline)]">
          <span className="text-xs text-[var(--lp-text-muted)]">{currentDraft.hook}</span>
          <Badge
            variant="outline"
            className="text-[11px] font-normal border-[var(--lp-border)] text-[var(--lp-ice)] bg-[var(--lp-surface-raised)]"
          >
            Draft ready
          </Badge>
        </div>
        <div className="py-3.5 space-y-2">
          <div className="text-[11px] font-normal text-[var(--lp-text-muted)] uppercase tracking-wider">
            Draft preview
          </div>
          <p className="text-sm font-normal text-[var(--lp-text-heading)] leading-relaxed">
            {currentDraft.text}
          </p>
        </div>
        <div className="pt-3 border-t border-[var(--lp-border-hairline)] flex items-center justify-between text-xs text-[var(--lp-text-muted)]">
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
      {/* Feature row grid: panel first on mobile, alternating order on desktop */}
      <div
        id={`feature-${feature.id}`}
        className={`scroll-mt-24 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-14 items-center py-8 first:pt-0 last:pb-0 lg:py-20 lg:first:pt-20 lg:last:pb-20 ${
          isReversed ? "lg:flex-row-reverse" : ""
        }`}
      >
        {/* Panel column: rounded-3xl container holding the 4-degree tilt mock UI card */}
        <div
          className={`lg:col-span-6 w-full min-w-0 ${
            isReversed ? "lg:order-2" : "lg:order-1"
          }`}
        >
          <GrainyPanel
            variant={feature.panelVariant}
            angle={feature.panelAngle}
            className="min-h-0 lg:min-h-[420px]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRow}
                initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-sm mx-auto min-w-0"
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
          className={`lg:col-span-6 w-full min-w-0 ${
            isReversed ? "lg:order-1" : "lg:order-2"
          }`}
        >
          {/* Eyebrow badge with mono step number matching the pipeline map */}
          <Badge
            variant="outline"
            className="rounded-full text-xs font-normal border-[var(--lp-border)] text-[var(--lp-ice)] bg-[var(--lp-surface)] mb-4 px-3 py-1 inline-flex items-center gap-2"
          >
            <span className="font-mono text-[11px] text-[var(--lp-text-muted)]">
              {feature.stepNumber}
            </span>
            <span>{feature.badge}</span>
          </Badge>

          {/* Quiet headline scaled smoothly with clamp on mobile */}
          <h2 className="landing-heading text-[clamp(1.75rem,7vw,2.5rem)] lg:text-5xl text-[var(--lp-text-heading)] mb-5 lg:mb-6">
            {feature.headline}
          </h2>

          {/* List of 3 rows separated by hairlines */}
          <div className="border-t border-[var(--lp-border-hairline)] divide-y divide-[var(--lp-border-hairline)]">
            {feature.rows.map((row, idx) => {
              const isActive = activeRow === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectRow(idx)}
                  className="w-full min-h-[44px] text-left py-4 lg:py-5 group cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)] rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-lg lg:text-xl font-normal transition-colors duration-200 ${
                        isActive
                          ? "text-[var(--lp-text-heading)]"
                          : "text-[var(--lp-text-muted)] lg:group-hover:text-[var(--lp-text-heading)]"
                      }`}
                    >
                      {row.title}
                    </span>
                  </div>

                  {/* Description shown for active row with at least 15px body text */}
                  {isActive && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="mt-2 text-[15px] lg:text-base text-[var(--lp-text-body)] font-normal leading-relaxed overflow-hidden"
                    >
                      {row.description}
                    </motion.p>
                  )}

                  {/* 1px progress indicator filling over 6 seconds */}
                  <div className="mt-3 w-full h-[1px] bg-[var(--lp-border-hairline)] relative overflow-hidden">
                    {isActive && (
                      <motion.div
                        key={progressKey}
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{
                          duration: reducedMotion ? 0 : 6,
                          ease: "linear",
                        }}
                        className="absolute left-0 top-0 bottom-0 bg-[var(--lp-ice)]"
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

// Main FeatureRows section container with an xl-only tracing beam rail in the left gutter.
export function FeatureRows() {
  const sectionRef = useRef<HTMLElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const beam = beamRef.current;
      if (!section || !beam) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference) and (min-width: 1280px)", () => {
        gsap.fromTo(
          beam,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top 60%",
              end: "bottom 70%",
              scrub: true,
            },
          }
        );
      });

      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  return (
    /* Features section on forced-dark #08090C canvas */
    <section
      id="features"
      ref={sectionRef}
      className="bg-[var(--lp-bg)] py-16 lg:py-24 overflow-x-hidden scroll-mt-24"
    >
      {/* Consistent 20px mobile container padding */}
      <div className="relative max-w-6xl mx-auto px-5 lg:px-6 divide-y divide-[var(--lp-border-hairline)]">
        {/* Thin Tracing Beam rail in the left gutter at xl and up without shifting content */}
        <div
          aria-hidden="true"
          className="hidden xl:flex flex-col justify-between items-center absolute -left-8 top-24 bottom-24 w-4 pointer-events-none"
        >
          <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-px bg-[var(--lp-border-hairline)]" />
          <div
            ref={beamRef}
            className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-px origin-top bg-[var(--lp-ice)]"
          />
          {features.map((f) => (
            <span
              key={f.id}
              className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-surface)] font-mono text-[9px] text-[var(--lp-ice)]"
            >
              {f.id === "drafter" ? "2·3" : f.stepNumber}
            </span>
          ))}
        </div>

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
