// This component provides scroll-triggered fade and rise animations with staggered child support.
"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  stagger?: boolean;
  delay?: number;
}

// Container variants with 60ms stagger between child items
const containerVariants = {
  hidden: { opacity: 0 },
  visible: (custom: { delay: number; stagger: boolean }) => ({
    opacity: 1,
    transition: {
      delayChildren: custom.delay,
      staggerChildren: custom.stagger ? 0.06 : 0,
    },
  }),
};

// Item variants: fade and move up 16px, 500ms duration, custom easing
export const scrollItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

// ScrollReveal wraps elements with viewport-triggered entrance animation executed once
export function ScrollReveal({
  children,
  className,
  stagger = false,
  delay = 0,
}: ScrollRevealProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={containerVariants}
      custom={{ delay, stagger }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-32px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ScrollRevealItem wraps individual children inside a staggered ScrollReveal container
export function ScrollRevealItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={scrollItemVariants} className={className}>
      {children}
    </motion.div>
  );
}
