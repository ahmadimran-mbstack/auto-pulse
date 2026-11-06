"use client";
import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "motion/react";
import { cn } from "@/lib/utils";

export const FloatingNav = ({
  navItems,
  className,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: React.ReactNode;
  }[];
  className?: string;
}) => {
  const { scrollYProgress } = useScroll();
  const [visible, setVisible] = useState(true);

  useMotionValueEvent(scrollYProgress, "change", (current) => {
    if (typeof current === "number") {
      const direction = current - scrollYProgress.getPrevious()!;

      if (scrollYProgress.get() < 0.05) {
        setVisible(true);
      } else {
        if (direction < 0) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    }
  });

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: 1,
          y: 0,
        }}
        animate={{
          y: visible ? 0 : -100,
          opacity: visible ? 1 : 0,
        }}
        transition={{
          duration: 0.25,
          ease: "easeInOut",
        }}
        className={cn(
          "flex max-w-fit fixed top-6 inset-x-0 mx-auto z-[5000] items-center justify-center px-4",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2.5 sm:gap-4 rounded-full border border-white/15 bg-white/[0.08] px-3 sm:px-4 py-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
          {/* Brand logo mark and title */}
          <Link href="/" className="flex items-center gap-2 pl-1 pr-1 group">
            <Image
              src="/logo-mark-blue-bg.png"
              alt="AutoPulse logo"
              width={26}
              height={26}
              className="w-6 h-6 object-contain rounded-full"
            />
            <span className="font-normal text-white text-sm tracking-[-0.03em] hidden sm:inline-block">
              AutoPulse
            </span>
          </Link>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15 hidden sm:block" />

          {/* Nav items container */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            {navItems.map((navItem, idx: number) => (
              <a
                key={`link-${idx}`}
                href={navItem.link}
                className={cn(
                  "relative flex items-center gap-1 rounded-full px-3 py-1.5 text-xs sm:text-sm font-normal text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                )}
              >
                {navItem.icon && <span className="block sm:hidden">{navItem.icon}</span>}
                <span className={navItem.icon ? "hidden sm:block" : "block"}>{navItem.name}</span>
              </a>
            ))}
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-white/15" />

          {/* Action buttons */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/auth/sign-in"
              className="text-xs sm:text-sm text-neutral-300 hover:text-white transition-colors px-2.5 py-1.5 font-normal"
            >
              Sign in
            </Link>
            <Link href="/auth/sign-up">
              <button className="relative rounded-full bg-white px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-ink transition-all hover:bg-neutral-100 hover:shadow-lg">
                <span>Get started</span>
              </button>
            </Link>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
