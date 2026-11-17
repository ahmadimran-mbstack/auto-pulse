// Renders the 5-step agent pipeline map with scroll-driven line drawing and 3D pointer tilt.
"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Magnet, PenLine, Search, ShieldCheck, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { pipelineCopy, type PipelineNodeCopy } from "@/content/landing";
import { realRun } from "@/content/real-run";
import { SplitHeading } from "./split-heading";
import { NumberTicker } from "./number-ticker";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Maps each pipeline step index to its semantic agent token key and badge variant.
const AGENT_META = [
  { key: "topic", variant: "landing-topic", Icon: Search },
  { key: "hook", variant: "landing-hook", Icon: Magnet },
  { key: "writer", variant: "landing-writer", Icon: PenLine },
  { key: "checker", variant: "landing-checker", Icon: ShieldCheck },
  { key: "human", variant: "landing-human", Icon: UserCheck },
] as const;

// Returns the chip content for each node based on whether verified real data exists.
function NodeChipContent({
  node,
  index,
  activated,
}: {
  node: PipelineNodeCopy;
  index: number;
  activated: boolean;
}) {
  if (!realRun.verified) {
    return <span className="truncate">{node.genericChip}</span>;
  }

  if (index === 0) {
    const sourceCount = new Set(
      realRun.topic.facts.map((f) => f.sourceDomain).filter(Boolean)
    ).size;
    return (
      <span className="line-clamp-1">
        {realRun.topic.title} ({sourceCount} sources)
      </span>
    );
  }

  if (index === 1) {
    return <span className="truncate">{realRun.hook.style}</span>;
  }

  if (index === 2) {
    return <span className="line-clamp-2">{realRun.hook.openingLine}</span>;
  }

  if (index === 3) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 font-mono">
        {realRun.rounds.map((r, i) => (
          <span key={r.round}>
            R{r.round} <NumberTicker value={r.checkerScore} active={activated} />
            {i < realRun.rounds.length - 1 ? " ·" : ""}
          </span>
        ))}
      </span>
    );
  }

  return <span className="truncate">{node.genericChip}</span>;
}

// Single pipeline node link with 4-degree 3D pointer tilt and subtle light sheen.
function PipelineNodeCard({
  node,
  index,
  activated,
  reducedMotion,
  isTouch,
}: {
  node: PipelineNodeCopy;
  index: number;
  activated: boolean;
  reducedMotion: boolean;
  isTouch: boolean;
}) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, px: 50, py: 50, hover: false });

  const canTilt = !reducedMotion && !isTouch;

  const handlePointerMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!canTilt || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - y) * 8,
      ry: (x - 0.5) * 8,
      px: x * 100,
      py: y * 100,
      hover: true,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rx: 0, ry: 0, px: 50, py: 50, hover: false });
  };

  const borderColor = tilt.hover
    ? "var(--lp-border-hover)"
    : activated
      ? `var(--lp-badge-${AGENT_META[index].key}-border)`
      : "var(--lp-border)";

  const agent = AGENT_META[index];
  const AgentIcon = agent.Icon;

  return (
    <div style={{ perspective: "900px" }} className="relative h-full">
      <a
        ref={cardRef}
        href={node.targetHref}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="pipeline-node group relative flex h-full flex-col justify-between rounded-2xl border p-5 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2"
        style={{
          backgroundColor: "var(--lp-surface)",
          borderColor,
          boxShadow: "var(--lp-highlight-top)",
          transform: canTilt
            ? `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`
            : undefined,
          transition:
            "transform 350ms cubic-bezier(0.22, 1, 0.36, 1), border-color 350ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: canTilt ? "transform" : undefined,
        }}
      >
        {/* Subtle pointer sheen visible only on desktop hover */}
        {canTilt && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
            style={{
              opacity: tilt.hover ? 1 : 0,
              background: `radial-gradient(220px circle at ${tilt.px}% ${tilt.py}%, rgba(191, 210, 238, 0.08), transparent 70%)`,
            }}
          />
        )}

        <div className="relative z-10">
          {/* Top row: 56px numeral ring with agent tint plus optional human tag on step 05 */}
          <div className="flex items-center justify-between gap-3">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border font-mono text-sm transition-colors duration-300"
              style={{
                borderColor: `var(--lp-badge-${agent.key}-border)`,
                backgroundColor: `var(--lp-badge-${agent.key}-tint)`,
                color: `var(--lp-badge-${agent.key}-fg)`,
              }}
            >
              {node.numeral}
            </div>

            {node.humanTag && (
              <Badge variant="landing-human">{node.humanTag}</Badge>
            )}
          </div>

          {/* Agent title and single-sentence role description */}
          <h3
            className="mt-4 text-lg font-normal tracking-tight"
            style={{ color: "var(--lp-text-heading)" }}
          >
            {node.name}
          </h3>
          <p
            className="mt-1.5 text-sm font-normal leading-relaxed"
            style={{ color: "var(--lp-text-muted)" }}
          >
            {node.description}
          </p>
        </div>

        {/* Output chip using the matching agent badge variant and icon */}
        <div
          className="relative z-10 mt-5 pt-3 border-t transition-opacity duration-500"
          style={{
            borderColor: "var(--lp-border-hairline)",
            opacity: activated ? 1 : 0.45,
          }}
        >
          <Badge variant={agent.variant} className="max-w-full">
            <AgentIcon className="shrink-0" />
            <NodeChipContent node={node} index={index} activated={activated} />
          </Badge>
        </div>
      </a>
    </div>
  );
}

// Main Pipeline Map section placed directly after the ThreeFacts row.
export function PipelineMap() {
  const sectionRef = useRef<HTMLElement>(null);
  const desktopLineRef = useRef<SVGLineElement>(null);
  const loopPathRef = useRef<SVGPathElement>(null);
  const mobileLineRef = useRef<SVGLineElement>(null);

  const [activatedCount, setActivatedCount] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqTouch = window.matchMedia("(pointer: coarse)");
    setReducedMotion(mqMotion.matches);
    setIsTouch(mqTouch.matches || "ontouchstart" in window);

    const onMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mqMotion.addEventListener("change", onMotion);
    return () => mqMotion.removeEventListener("change", onMotion);
  }, []);

  useGSAP(
    () => {
      const section = sectionRef.current;
      if (!section) return;

      const mm = gsap.matchMedia();

      // Reduced motion: reveal nodes with a short fade and activate all immediately.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        setActivatedCount(5);
        gsap.from(section.querySelectorAll(".pipeline-node"), {
          opacity: 0,
          duration: 0.2,
          ease: "expo.out",
          scrollTrigger: {
            trigger: section,
            start: "top 75%",
            once: true,
          },
        });
      });

      // Full motion: draw the SVG line once at 70% viewport and activate each node in turn.
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top 70%",
            once: true,
          },
        });

        const desktopLine = desktopLineRef.current;
        const loopPath = loopPathRef.current;
        const mobileLine = mobileLineRef.current;

        if (desktopLine) {
          const len = desktopLine.getTotalLength();
          gsap.set(desktopLine, { strokeDasharray: len, strokeDashoffset: len });
          tl.to(
            desktopLine,
            {
              strokeDashoffset: 0,
              duration: 1.6,
              ease: "expo.out",
            },
            0
          );
        }

        if (mobileLine) {
          const mLen = mobileLine.getTotalLength();
          gsap.set(mobileLine, { strokeDasharray: mLen, strokeDashoffset: mLen });
          tl.to(
            mobileLine,
            {
              strokeDashoffset: 0,
              duration: 1.4,
              ease: "expo.out",
            },
            0
          );
        }

        // Activate nodes 1 through 5 progressively with 60ms+ spacing along the draw.
        [0, 1, 2, 3, 4].forEach((idx) => {
          tl.call(
            () => setActivatedCount((prev) => Math.max(prev, idx + 1)),
            [],
            idx * 0.26
          );
        });

        // Draw the dashed return loop from node 04 back to node 03 after the main line.
        if (loopPath) {
          const lLen = loopPath.getTotalLength();
          gsap.set(loopPath, {
            strokeDasharray: "5 5",
            strokeDashoffset: lLen,
            opacity: 0,
          });
          tl.to(
            loopPath,
            {
              opacity: 1,
              strokeDashoffset: 0,
              duration: 0.7,
              ease: "expo.out",
            },
            1.25
          );
        }
      });

      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  return (
    <section
      id="pipeline"
      ref={sectionRef}
      data-nav-theme="dark"
      className="scroll-mt-24 py-16 lg:py-24 border-t"
      style={{
        backgroundColor: "var(--lp-bg)",
        borderColor: "var(--lp-border-hairline)",
      }}
    >
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        {/* Section header with shared eyebrow pill, SplitText headline, and subline */}
        <div className="max-w-2xl mb-12 lg:mb-16">
          <Badge variant="landing-eyebrow" className="mb-4">
            {pipelineCopy.pill}
          </Badge>

          <SplitHeading className="landing-heading text-3xl sm:text-4xl lg:text-5xl text-white">
            {pipelineCopy.headline}
          </SplitHeading>

          <p
            className="mt-4 text-base lg:text-lg font-normal leading-relaxed"
            style={{ color: "var(--lp-text-muted)" }}
          >
            {pipelineCopy.subline}
          </p>
        </div>

        {/* Pipeline grid: horizontal 5 columns on desktop, vertical stack with left rail on mobile */}
        <div className="relative">
          {/* Desktop horizontal connecting line passing behind the 56px node rings */}
          <svg
            aria-hidden="true"
            className="pointer-events-none hidden lg:block absolute left-0 right-0 top-12 h-1 w-full z-0"
            preserveAspectRatio="none"
            viewBox="0 0 1000 4"
          >
            <defs>
              <linearGradient id="pipeline-line-h" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--lp-badge-topic-dot)" />
                <stop offset="25%" stopColor="var(--lp-badge-hook-dot)" />
                <stop offset="50%" stopColor="var(--lp-badge-writer-dot)" />
                <stop offset="75%" stopColor="var(--lp-badge-checker-dot)" />
                <stop offset="100%" stopColor="var(--lp-badge-human-dot)" />
              </linearGradient>
            </defs>
            <line
              x1="100"
              y1="2"
              x2="900"
              y2="2"
              stroke="var(--lp-border)"
              strokeWidth="1.5"
            />
            <line
              ref={desktopLineRef}
              x1="100"
              y1="2"
              x2="900"
              y2="2"
              stroke="url(#pipeline-line-h)"
              strokeOpacity="0.5"
              strokeWidth="1.5"
            />
          </svg>

          {/* Mobile vertical connecting line along the left side */}
          <svg
            aria-hidden="true"
            className="pointer-events-none lg:hidden absolute left-4 top-6 bottom-6 w-1 h-auto z-0"
            preserveAspectRatio="none"
            viewBox="0 0 4 1000"
          >
            <defs>
              <linearGradient id="pipeline-line-v" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--lp-badge-topic-dot)" />
                <stop offset="25%" stopColor="var(--lp-badge-hook-dot)" />
                <stop offset="50%" stopColor="var(--lp-badge-writer-dot)" />
                <stop offset="75%" stopColor="var(--lp-badge-checker-dot)" />
                <stop offset="100%" stopColor="var(--lp-badge-human-dot)" />
              </linearGradient>
            </defs>
            <line
              x1="2"
              y1="0"
              x2="2"
              y2="1000"
              stroke="var(--lp-border)"
              strokeWidth="1.5"
            />
            <line
              ref={mobileLineRef}
              x1="2"
              y1="0"
              x2="2"
              y2="1000"
              stroke="url(#pipeline-line-v)"
              strokeOpacity="0.5"
              strokeWidth="1.5"
            />
          </svg>

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-4 pl-8 lg:pl-0">
            {pipelineCopy.nodes.map((node, index) => (
              <React.Fragment key={node.numeral}>
                <PipelineNodeCard
                  node={node}
                  index={index}
                  activated={index < activatedCount}
                  reducedMotion={reducedMotion}
                  isTouch={isTouch}
                />
                {/* Mobile-only loop caption placed directly under node 04 */}
                {index === 3 && (
                  <p
                    className="lg:hidden text-xs font-normal pl-1 pb-1"
                    style={{ color: "var(--lp-text-muted)" }}
                  >
                    {pipelineCopy.loopCaption}
                  </p>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Desktop dashed curved loop path returning from node 04 back to node 03 */}
          <div className="hidden lg:block relative mt-2">
            <svg
              aria-hidden="true"
              className="w-full h-14 overflow-visible"
              viewBox="0 0 1000 56"
              preserveAspectRatio="none"
            >
              <path
                ref={loopPathRef}
                d="M 700 4 C 700 44, 500 44, 500 4"
                fill="none"
                stroke="var(--lp-ice)"
                strokeOpacity="0.65"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
            </svg>
            <p
              className="text-center text-xs font-normal -mt-2"
              style={{ color: "var(--lp-text-muted)" }}
            >
              {pipelineCopy.loopCaption}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

