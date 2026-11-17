// Renders the pinned 4-stage real pipeline run story when verified data is present.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Badge } from "@/components/ui/badge";
import { realRun } from "@/content/real-run";
import { realRunCopy } from "@/content/landing";
import { SplitHeading } from "./split-heading";
import { NumberTicker } from "./number-ticker";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Lightweight SVG film grain matching the existing grainy panels.
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

// Renders Stage 1: Topic title, fact count, and expandable source facts.
function StageTopic({ onHeightChange }: { onHeightChange: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const facts = realRun.topic.facts;
  const visibleFacts = showAll ? facts : facts.slice(0, 4);
  const sourceCount = new Set(facts.map((f) => f.sourceDomain).filter(Boolean)).size;

  const toggleShowAll = () => {
    setShowAll((prev) => !prev);
    requestAnimationFrame(onHeightChange);
  };

  return (
    <div className="space-y-5">
      <div>
        <div
          className="text-xs font-mono uppercase tracking-wider"
          style={{ color: "var(--lp-text-muted)" }}
        >
          {facts.length} facts from {sourceCount} {sourceCount === 1 ? "source" : "sources"}
        </div>
        <h3
          className="mt-2 text-2xl sm:text-3xl font-normal tracking-tight leading-snug"
          style={{ color: "var(--lp-text-heading)" }}
        >
          {realRun.topic.title}
        </h3>
      </div>

      <ul className="space-y-3">
        {visibleFacts.map((fact, idx) => {
          const letter = (fact.sourceDomain || "?").charAt(0).toUpperCase();
          return (
            <li
              key={idx}
              className="rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: "var(--lp-surface-raised)",
                borderColor: "var(--lp-border)",
              }}
            >
              <p
                className="text-sm font-normal leading-relaxed"
                style={{ color: "var(--lp-text-body)" }}
              >
                {fact.text}
              </p>
              <Badge
                variant="landing-neutral"
                className="font-mono self-start sm:self-center"
              >
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                  style={{
                    backgroundColor: "var(--lp-navy-deep)",
                    color: "var(--lp-ice)",
                  }}
                >
                  {letter}
                </span>
                <span>{fact.sourceDomain}</span>
              </Badge>
            </li>
          );
        })}
      </ul>

      {facts.length > 4 && (
        <button
          type="button"
          onClick={toggleShowAll}
          className="text-xs font-normal underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 rounded"
          style={{ color: "var(--lp-ice)" }}
        >
          {showAll ? realRunCopy.showFewerFacts : realRunCopy.showAllFacts}
        </button>
      )}
    </div>
  );
}

// Renders Stage 2: Hook style badge and opening line with optional expansion.
function StageHook({ onHeightChange }: { onHeightChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = realRun.hook.openingLine.length > 220;

  const toggleExpand = () => {
    setExpanded((prev) => !prev);
    requestAnimationFrame(onHeightChange);
  };

  return (
    <div className="space-y-5">
      <div>
        <Badge variant="landing-hook">{realRun.hook.style}</Badge>
      </div>

      <p
        className={`text-xl sm:text-2xl font-normal tracking-tight leading-relaxed ${
          !expanded && isLong ? "line-clamp-4" : ""
        }`}
        style={{ color: "var(--lp-text-heading)" }}
      >
        {realRun.hook.openingLine}
      </p>

      {isLong && (
        <button
          type="button"
          onClick={toggleExpand}
          className="text-xs font-normal underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 rounded"
          style={{ color: "var(--lp-ice)" }}
        >
          {expanded ? realRunCopy.showLess : realRunCopy.showMore}
        </button>
      )}
    </div>
  );
}

// Renders Stage 3: Revision rounds with checker score bars and threshold marker at 15.
function StageRounds({
  active,
  reducedMotion,
  onHeightChange,
}: {
  active: boolean;
  reducedMotion: boolean;
  onHeightChange: () => void;
}) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const rounds = realRun.rounds;

  const toggleRound = (roundNum: number) => {
    setExpandedRound((prev) => (prev === roundNum ? null : roundNum));
    requestAnimationFrame(onHeightChange);
  };

  return (
    <div className="space-y-4">
      {rounds.length === 1 && (
        <p className="text-xs font-mono" style={{ color: "var(--lp-ice)" }}>
          {realRunCopy.passedFirstRound}
        </p>
      )}

      <div className="space-y-3">
        {rounds.map((r) => {
          const isChosen = r.round === realRun.finalRound;
          const isExpanded = expandedRound === r.round;
          const barWidth = Math.min(Math.max(r.checkerScore, 0), 100);

          return (
            <div
              key={r.round}
              className="rounded-xl border p-4 space-y-3"
              style={{
                backgroundColor: isChosen
                  ? "var(--lp-surface-raised)"
                  : "var(--lp-surface)",
                borderColor: isChosen ? "var(--lp-ice)" : "var(--lp-border)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs"
                    style={{
                      color: isChosen
                        ? "var(--lp-ice)"
                        : "var(--lp-text-muted)",
                    }}
                  >
                    Round {r.round}
                  </span>
                  {isChosen && (
                    <Badge variant="landing-neutral">Chosen</Badge>
                  )}
                </div>

                <Badge
                  variant={r.checkerScore < 15 ? "landing-checker" : "landing-hook"}
                  className="font-mono"
                >
                  <NumberTicker value={r.checkerScore} active={active} />
                  <span>/ 100</span>
                </Badge>
              </div>

              {/* Thin score bar with a fixed marker at 15 */}
              <div
                className="relative h-1.5 w-full rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--lp-border)" }}
              >
                <motion.div
                  initial={{ scaleX: reducedMotion ? 1 : 0 }}
                  animate={{ scaleX: active ? 1 : 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.65,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="h-full origin-left rounded-full"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor:
                      r.checkerScore < 15
                        ? "var(--lp-ice)"
                        : "var(--lp-blue)",
                  }}
                />
                <div
                  title={realRunCopy.thresholdLabel}
                  aria-label={realRunCopy.thresholdLabel}
                  className="absolute top-0 bottom-0 w-0.5"
                  style={{
                    left: "15%",
                    backgroundColor: "var(--lp-text-heading)",
                  }}
                />
              </div>

              <p
                className={`text-sm font-normal leading-relaxed ${
                  isExpanded ? "" : "line-clamp-2"
                }`}
                style={{ color: "var(--lp-text-body)" }}
              >
                {r.preview}
              </p>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                {r.revisionNote ? (
                  <p
                    className="text-xs font-normal"
                    style={{ color: "var(--lp-text-muted)" }}
                  >
                    {r.revisionNote}
                  </p>
                ) : (
                  <span />
                )}

                {r.preview.length > 110 && (
                  <button
                    type="button"
                    onClick={() => toggleRound(r.round)}
                    className="text-xs font-normal underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 rounded"
                    style={{ color: "var(--lp-ice)" }}
                  >
                    {isExpanded ? realRunCopy.showLess : realRunCopy.showMore}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Renders Stage 4: Final LinkedIn-style post preview card and passing badge if under 15.
function StageFinalPost({ onHeightChange }: { onHeightChange: () => void }) {
  const [showFull, setShowFull] = useState(false);
  const chosenRound = realRun.rounds.find(
    (r) => r.round === realRun.finalRound
  );
  const finalScore = chosenRound?.checkerScore;
  const passedCheck = typeof finalScore === "number" && finalScore < 15;
  const initial = (realRun.accountLabel || "A").charAt(0).toUpperCase();
  const isLong = realRun.finalPost.length > 260;

  const toggleFull = () => {
    setShowFull((prev) => !prev);
    requestAnimationFrame(onHeightChange);
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border p-5 space-y-4"
        style={{
          backgroundColor: "var(--lp-surface-raised)",
          borderColor: "var(--lp-border)",
          boxShadow: "var(--lp-highlight-top)",
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full border font-mono text-xs"
              style={{
                borderColor: "var(--lp-border)",
                backgroundColor: "var(--lp-surface)",
                color: "var(--lp-ice)",
              }}
            >
              {initial}
            </div>
            <div>
              <div
                className="text-sm font-normal"
                style={{ color: "var(--lp-text-heading)" }}
              >
                {realRun.accountLabel}
              </div>
              <div
                className="text-xs font-normal"
                style={{ color: "var(--lp-text-muted)" }}
              >
                {realRun.date}
              </div>
            </div>
          </div>

          {passedCheck && (
            <Badge variant="landing-checker" dot>
              Passed the writing check: {finalScore} out of 100
            </Badge>
          )}
        </div>

        <p
          className={`whitespace-pre-line text-sm sm:text-base font-normal leading-relaxed ${
            !showFull && isLong ? "line-clamp-5" : ""
          }`}
          style={{ color: "var(--lp-text-body)" }}
        >
          {realRun.finalPost}
        </p>

        {isLong && (
          <button
            type="button"
            onClick={toggleFull}
            className="text-xs font-normal underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 rounded"
            style={{ color: "var(--lp-ice)" }}
          >
            {showFull ? realRunCopy.hideFullPost : realRunCopy.showFullPost}
          </button>
        )}
      </div>

      {realRun.stats && (
        <p
          className="text-xs font-mono"
          style={{ color: "var(--lp-text-muted)" }}
        >
          {realRun.stats.seconds}s · {realRun.stats.modelCalls} model calls
        </p>
      )}
    </div>
  );
}

// Main One Real Run section: completely absent when realRun.verified is false.
export function OneRealRun() {
  if (!realRun.verified) {
    return null;
  }

  return <OneRealRunInner />;
}

// Inner client component mounted only when verified real-run data exists.
function OneRealRunInner() {
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const progressLineRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);

  const [activeStage, setActiveStage] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const refreshScroll = () => {
    ScrollTrigger.refresh();
  };

  useGSAP(
    () => {
      const panel = panelRef.current;
      if (!panel) return;

      const mm = gsap.matchMedia();

      // Desktop pinned story across 4 stages (~3 screens of scroll).
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const st = ScrollTrigger.create({
          trigger: panel,
          start: "top 12%",
          end: "+=2400",
          pin: true,
          scrub: true,
          onUpdate: (self) => {
            const stageIdx = Math.min(3, Math.floor(self.progress * 4));
            setActiveStage(stageIdx);
            if (progressLineRef.current) {
              progressLineRef.current.style.transform = `scaleY(${self.progress})`;
            }
          },
        });
        triggerRef.current = st;

        if (typeof document !== "undefined" && document.fonts?.ready) {
          document.fonts.ready.then(() => ScrollTrigger.refresh());
        }

        return () => {
          triggerRef.current = null;
          st.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  // Scrolls smoothly to the matching scroll offset when a desktop stage button is clicked.
  const handleSelectStage = (idx: number) => {
    setActiveStage(idx);
    const st = triggerRef.current;
    if (st) {
      const targetProgress = idx / 4 + 0.02;
      const targetY = st.start + (st.end - st.start) * targetProgress;
      window.scrollTo({
        top: targetY,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }
  };

  return (
    <section
      id="real-run"
      ref={sectionRef}
      data-nav-theme="dark"
      className="scroll-mt-24 py-16 lg:py-24 border-t"
      style={{
        backgroundColor: "var(--lp-bg)",
        borderColor: "var(--lp-border-hairline)",
      }}
    >
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        <div className="max-w-2xl mb-10 lg:mb-14">
          <Badge variant="landing-eyebrow" className="mb-4">
            {realRunCopy.pill}
          </Badge>

          <SplitHeading className="landing-heading text-3xl sm:text-4xl lg:text-5xl text-white">
            {realRunCopy.headline}
          </SplitHeading>

          <p
            className="mt-4 text-base lg:text-lg font-normal leading-relaxed"
            style={{ color: "var(--lp-text-muted)" }}
          >
            {realRunCopy.subline}
          </p>
        </div>

        {/* Desktop pinned interactive panel */}
        <div
          ref={panelRef}
          className="hidden lg:block relative rounded-3xl border overflow-hidden p-8 lg:p-10"
          style={{
            backgroundColor: "var(--lp-surface)",
            borderColor: "var(--lp-border)",
            backgroundImage:
              "radial-gradient(circle at 80% 20%, rgba(26, 86, 184, 0.22), transparent 55%), radial-gradient(circle at 15% 85%, rgba(0, 23, 64, 0.7), transparent 60%)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("${NOISE_DATA_URI}")`,
              backgroundRepeat: "repeat",
              backgroundSize: "160px 160px",
              mixBlendMode: "overlay",
            }}
          />

          <div className="relative z-10 grid grid-cols-12 gap-10 items-start">
            {/* Left stage list with vertical progress line */}
            <div className="col-span-4 relative pl-6 space-y-2">
              <div
                aria-hidden="true"
                className="absolute left-1.5 top-3 bottom-3 w-px"
                style={{ backgroundColor: "var(--lp-border)" }}
              />
              <div
                ref={progressLineRef}
                aria-hidden="true"
                className="absolute left-1.5 top-3 bottom-3 w-px origin-top"
                style={{
                  backgroundColor: "var(--lp-ice)",
                  transform: "scaleY(0)",
                }}
              />

              {realRunCopy.stages.map((stage, idx) => {
                const isActive = activeStage === idx;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => handleSelectStage(idx)}
                    className="w-full text-left rounded-xl px-4 py-3.5 transition-colors duration-300 cursor-pointer flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      backgroundColor: isActive
                        ? "var(--lp-surface-raised)"
                        : "transparent",
                      color: isActive
                        ? "var(--lp-text-heading)"
                        : "var(--lp-text-muted)",
                    }}
                  >
                    <span className="font-mono text-xs">{stage.number}</span>
                    <span className="text-base font-normal">{stage.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right run card crossfading between the 4 stages */}
            <div className="col-span-8 min-h-[380px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStage}
                  initial={{
                    opacity: 0,
                    y: reducedMotion ? 0 : 12,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: reducedMotion ? 0 : -12,
                  }}
                  transition={{
                    duration: 0.35,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {activeStage === 0 && (
                    <StageTopic onHeightChange={refreshScroll} />
                  )}
                  {activeStage === 1 && (
                    <StageHook onHeightChange={refreshScroll} />
                  )}
                  {activeStage === 2 && (
                    <StageRounds
                      active={true}
                      reducedMotion={reducedMotion}
                      onHeightChange={refreshScroll}
                    />
                  )}
                  {activeStage === 3 && (
                    <StageFinalPost onHeightChange={refreshScroll} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Mobile stacked layout: 4 cards in order with no pinning */}
        <div className="lg:hidden space-y-5">
          {realRunCopy.stages.map((stage, idx) => (
            <div
              key={stage.id}
              className="rounded-2xl border p-5 space-y-4"
              style={{
                backgroundColor: "var(--lp-surface)",
                borderColor: "var(--lp-border)",
              }}
            >
              <div
                className="flex items-center gap-2 font-mono text-xs"
                style={{ color: "var(--lp-ice)" }}
              >
                <span>{stage.number}</span>
                <span>{stage.label}</span>
              </div>
              {idx === 0 && <StageTopic onHeightChange={refreshScroll} />}
              {idx === 1 && <StageHook onHeightChange={refreshScroll} />}
              {idx === 2 && (
                <StageRounds
                  active={true}
                  reducedMotion={reducedMotion}
                  onHeightChange={refreshScroll}
                />
              )}
              {idx === 3 && <StageFinalPost onHeightChange={refreshScroll} />}
            </div>
          ))}
        </div>

        <p
          className="mt-4 text-xs font-normal"
          style={{ color: "var(--lp-text-muted)" }}
        >
          {realRunCopy.caption}
        </p>
      </div>
    </section>
  );
}

