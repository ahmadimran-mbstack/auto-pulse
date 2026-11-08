// This component renders the hero with animated WebGL gradient blinds and left-aligned hero typography matching reference.
"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import GradientBlinds from "@/components/GradientBlinds";
import { LinkedInIcon } from "./platform-icons";

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
        <div className="max-w-5xl">
          {/* Main headline with 40ms blur-to-sharp word reveal */}
          <p className="landing-heading text-3xl sm:text-4xl md:text-5xl text-white flex flex-wrap text-left font-normal tracking-tight">
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
            className="mt-2 text-lg md:text-xl text-text-muted-dark max-w-2xl font-normal leading-relaxed text-left flex items-center flex-wrap gap-x-2 gap-y-1"
          >
            <span>AI Agents that help you build your brand on</span>
            <span className="inline-flex items-center gap-1.5 text-white font-normal">
              <LinkedInIcon className="w-5 h-5 shrink-0" />
              <span>LinkedIn</span>
            </span>
            <span>by managing your entire pipeline</span>
          </motion.p>

          {/* Action buttons with layout and styles matching reference */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 flex flex-wrap items-center justify-start gap-3.5"
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
