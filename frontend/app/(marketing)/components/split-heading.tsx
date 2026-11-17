// Reveals section headings line by line using GSAP SplitText and ScrollTrigger.
"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

interface SplitHeadingProps {
  children: string;
  className?: string;
  as?: "h2" | "p";
}

// Animates each wrapped line rising from its masked baseline once on scroll.
export function SplitHeading({
  children,
  className = "",
  as: Tag = "p",
}: SplitHeadingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const el = headingRef.current;
      if (!el) return;

      const mm = gsap.matchMedia();

      // Full line-mask reveal when motion is allowed.
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = new SplitText(el, {
          type: "lines",
          mask: "lines",
        });

        gsap.from(split.lines, {
          yPercent: 100,
          opacity: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: "expo.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            once: true,
          },
        });

        return () => {
          split.revert();
        };
      });

      // Short opacity fade only when reduced motion is preferred.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.from(el, {
          opacity: 0,
          duration: 0.2,
          ease: "expo.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            once: true,
          },
        });
      });

      return () => mm.revert();
    },
    { scope: headingRef }
  );

  return (
    <Tag ref={headingRef} className={className}>
      {children}
    </Tag>
  );
}

