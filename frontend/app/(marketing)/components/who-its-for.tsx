// Renders the "Who it's for" audience cards and the single faceted crystal scene.
"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Briefcase, ChevronRight, Layers, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whoItsForCopy, type AudienceCardCopy } from "@/content/landing";
import { ScrollReveal, ScrollRevealItem } from "./scroll-reveal";
import { SpotlightCard } from "./spotlight-card";
import { SplitHeading } from "./split-heading";

// Dynamically load the Three.js crystal on the client only to keep SSR clean.
const FacetedCrystalCanvas = dynamic(() => import("./faceted-crystal-canvas"), {
  ssr: false,
  loading: () => <StaticCrystalFallback />,
});

// Static CSS faceted shape shown below 768px or when WebGL is unavailable.
function StaticCrystalFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-28 w-28 sm:h-32 sm:w-32 mx-auto"
      style={{
        clipPath: "polygon(50% 0%, 95% 28%, 82% 85%, 18% 85%, 5% 28%)",
        background:
          "linear-gradient(135deg, var(--lp-ice) 0%, var(--lp-blue) 45%, var(--lp-navy-deep) 100%)",
        opacity: 0.85,
      }}
    />
  );
}

// Maps each audience card icon key to its Lucide icon component.
function AudienceIcon({ name }: { name: AudienceCardCopy["icon"] }) {
  const props = {
    className: "h-5 w-5",
    style: { color: "var(--lp-ice)" },
    strokeWidth: 1.75,
  };
  if (name === "rocket") return <Rocket {...props} />;
  if (name === "layers") return <Layers {...props} />;
  return <Briefcase {...props} />;
}

// Main Who It's For section placed after One Real Run.
export function WhoItsFor() {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const [inView, setInView] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hasWebGL, setHasWebGL] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mqDesktop = window.matchMedia("(min-width: 768px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    setIsDesktop(mqDesktop.matches);
    setReducedMotion(mqMotion.matches);

    // Check WebGL availability once on mount.
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") || canvas.getContext("webgl");
      setHasWebGL(Boolean(gl));
    } catch {
      setHasWebGL(false);
    }

    const onDesktop = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    const onMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mqDesktop.addEventListener("change", onDesktop);
    mqMotion.addEventListener("change", onMotion);

    // Render Three.js only while this section is visible in the viewport.
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);

    return () => {
      mqDesktop.removeEventListener("change", onDesktop);
      mqMotion.removeEventListener("change", onMotion);
      observer.disconnect();
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    pointerRef.current = {
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
    };
  };

  return (
    <section
      id="who-its-for"
      ref={sectionRef}
      data-nav-theme="dark"
      onPointerMove={handlePointerMove}
      className="scroll-mt-24 py-16 lg:py-24 border-t"
      style={{
        backgroundColor: "var(--lp-bg)",
        borderColor: "var(--lp-border-hairline)",
      }}
    >
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        {/* Header row with SplitText headline on the left and faceted crystal on the right */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12 lg:mb-16">
          <div className="max-w-2xl">
            <SplitHeading className="landing-heading text-3xl sm:text-4xl lg:text-5xl text-white">
              {whoItsForCopy.headline}
            </SplitHeading>
          </div>

          <div className="h-32 w-32 sm:h-36 sm:w-36 shrink-0 flex items-center justify-center self-start md:self-center">
            {isDesktop && hasWebGL ? (
              <FacetedCrystalCanvas
                inView={inView}
                reducedMotion={reducedMotion}
                pointer={pointerRef}
              />
            ) : (
              <StaticCrystalFallback />
            )}
          </div>
        </div>

        {/* Three audience cards with cursor border spotlight and 60ms stagger reveal */}
        <ScrollReveal
          stagger
          className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch"
        >
          {whoItsForCopy.cards.map((card) => (
            <ScrollRevealItem key={card.id} className="h-full">
              <SpotlightCard className="h-full">
                <div className="flex h-full flex-col justify-between p-6 lg:p-7">
                  <div>
                    <div
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                      style={{
                        borderColor: "var(--lp-border)",
                        backgroundColor: "var(--lp-surface-raised)",
                      }}
                    >
                      <AudienceIcon name={card.icon} />
                    </div>

                    <h3
                      className="mt-5 text-xl font-normal tracking-tight"
                      style={{ color: "var(--lp-text-heading)" }}
                    >
                      {card.title}
                    </h3>

                    <p
                      className="mt-2.5 text-sm sm:text-base font-normal leading-relaxed"
                      style={{ color: "var(--lp-text-body)" }}
                    >
                      {card.description}
                    </p>
                  </div>

                  <div
                    className="mt-6 pt-4 border-t"
                    style={{ borderColor: "var(--lp-border-hairline)" }}
                  >
                    <div
                      className="text-xs font-mono uppercase tracking-wider"
                      style={{ color: "var(--lp-text-muted)" }}
                    >
                      {card.exampleLabel}
                    </div>
                    <p
                      className="mt-1.5 text-sm font-normal leading-snug"
                      style={{ color: "var(--lp-ice)" }}
                    >
                      {card.exampleTopic}
                    </p>
                  </div>
                </div>
              </SpotlightCard>
            </ScrollRevealItem>
          ))}
        </ScrollReveal>

        {/* Primary CTA button below the three audience cards */}
        <div className="mt-10 flex justify-start">
          <Link href={whoItsForCopy.ctaHref} className="group">
            <Button
              className="rounded-xl px-6 h-10 text-sm font-medium gap-1.5 flex items-center active:scale-95 transition-all duration-200"
              style={{
                backgroundColor: "var(--lp-text-heading)",
                color: "var(--lp-bg)",
              }}
            >
              <span>{whoItsForCopy.ctaLabel}</span>
              <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

