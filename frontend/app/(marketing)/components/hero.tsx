// This component renders the hero with animated WebGL gradient blinds and left-aligned hero typography matching reference.
"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import GradientBlinds from "@/components/GradientBlinds";

// Headline words to animate sequentially 40ms apart
const headlineWords = [
  "Your",
  "LinkedIn",
  "posts,",
  "strategized,",
  "written",
  "and",
  "published",
  "for",
  "you",
];

// This component renders the hero section with ribbon backdrop and animated elements
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy-deep text-white min-h-screen flex flex-col justify-end pt-20 pb-8 sm:pb-10 md:pb-12">
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

      {/* WebGL gradient blinds background with smooth bottom fade */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
        }}
      >
        <GradientBlinds
          gradientColors={["#1A56B8", "#3B82F6", "#BFD2EE"]}
          angle={20}
          spotlightRadius={0.75}
        />
      </div>

      <div className="relative z-10 w-full px-6 sm:px-10 md:px-12 lg:px-16">
        <div className="max-w-4xl">
          {/* Main headline with 40ms blur-to-sharp word reveal */}
          <p className="landing-heading text-4xl sm:text-5xl md:text-6xl text-white flex flex-wrap text-left font-normal sm:font-medium tracking-tight">
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
          </p>

          {/* Supporting subheadline explaining how the product works */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 text-base sm:text-lg md:text-xl text-text-muted-dark max-w-xl font-normal leading-relaxed text-left"
          >
            AI Agents that help you build your brand on LinkedIn by managing your entire pipeline
          </motion.p>

          {/* Action buttons with layout and styles matching reference */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-wrap items-center justify-start gap-3.5"
          >
            <Link href="/auth/sign-up">
              <Button className="rounded-xl bg-white text-ink hover:bg-neutral-100 px-6 h-10 text-md font-medium gap-1.5 flex items-center">
                <span>Get started</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button
                variant="outline"
                className="rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/15 backdrop-blur-sm px-6 h-10 text-md font-medium"
              >
                See how it works
              </Button>
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
