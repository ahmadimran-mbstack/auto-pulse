// This component renders the hero with animated WebGL ribbon, blur-to-sharp word reveal, and 3D tilt card.
"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { HeroTiltCard } from "./hero-tilt-card";

// Dynamic import for Three.js WebGL canvas with SSR disabled
const HeroRibbonCanvas = dynamic(() => import("./hero-ribbon-canvas"), {
  ssr: false,
});

// Headline words to animate sequentially 40ms apart
const headlineWords = [
  "Build",
  "your",
  "personal",
  "brand",
  "on",
  "LinkedIn",
  "without",
  "writing",
  "a",
  "single",
  "post.",
];

// This component renders the hero section with ribbon backdrop and animated elements
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy-deep text-white pt-16 pb-28 md:pt-24 md:pb-48 border-b border-border-dark">
      {/* Huge cropped faceted logo mark at 5 to 6 percent opacity (allowed in hero and final CTA only) */}
      <div
        className="pointer-events-none absolute -left-28 -top-28 sm:-left-36 sm:-top-36 w-[440px] sm:w-[600px] h-[440px] sm:h-[600px] select-none opacity-[0.055]"
        aria-hidden="true"
      >
        <Image
          src="/logo-mark-blue-bg.png"
          alt=""
          width={600}
          height={600}
          className="w-full h-full object-contain"
        />
      </div>

      {/* WebGL flowing wave ribbon fading in over 1.2 seconds */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <HeroRibbonCanvas />
      </motion.div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        {/* Main headline with 40ms blur-to-sharp word reveal */}
        <h1 className="landing-heading text-4xl sm:text-5xl md:text-6xl text-white max-w-3xl mx-auto flex flex-wrap justify-center">
          {headlineWords.map((word, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, filter: "blur(8px)", y: 4 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              transition={{
                duration: 0.45,
                delay: index * 0.04,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="inline-block mr-[0.24em] last:mr-0"
            >
              {word}
            </motion.span>
          ))}
        </h1>

        {/* Supporting subheadline explaining how the product works */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-base sm:text-lg md:text-xl text-text-muted-dark max-w-2xl mx-auto font-normal leading-relaxed"
        >
          AI Agents that help you build your brand on LinkedIn by managing it
        </motion.p>

        {/* Action buttons with pill shapes */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3.5"
        >
          <Link href="/auth/sign-up">
            <Button className="rounded-full bg-white text-ink hover:bg-neutral-100 px-6 h-11 text-sm font-normal">
              Get started
            </Button>
          </Link>
          <a href="#features">
            <Button
              variant="outline"
              className="rounded-full border-border-dark bg-transparent text-white hover:bg-white/10 px-6 h-11 text-sm font-normal"
            >
              See how it works
            </Button>
          </a>
        </motion.div>

        {/* Hero 3D tilt card rising up 24px into place */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-14 -mb-40 md:-mb-56 relative z-10 max-w-2xl mx-auto text-left"
        >
          <HeroTiltCard />
        </motion.div>
      </div>
    </section>
  );
}
