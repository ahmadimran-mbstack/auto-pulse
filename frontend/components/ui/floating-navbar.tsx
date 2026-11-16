"use client";
import React, { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "motion/react";
import { cn } from "@/lib/utils";

/* Use layoutEffect in the browser to avoid a color flash, and regular effect on the server */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* Floating pill navbar that adapts its text, icon, logo, and button colors to the section behind it */
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
  /* Track whether the navbar is currently visible while scrolling */
  const { scrollYProgress } = useScroll();
  const [visible, setVisible] = useState(true);

  /* Store the single theme value ("dark" or "light") from the section behind the navbar */
  const [navTheme, setNavTheme] = useState<"dark" | "light">("dark");

  /* Show the navbar at the top or when scrolling up, and hide it when scrolling down */
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

  /* Watch a 1px horizontal line at the navbar height (48px) using one IntersectionObserver */
  useIsomorphicLayoutEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-nav-theme]")
    );
    if (sections.length === 0) return;

    /* Pick the right theme right away on first load or mid-page refresh before paint */
    const probeY = 48;
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.top <= probeY && rect.bottom > probeY) {
        const initialTheme = section.dataset.navTheme;
        if (initialTheme === "light" || initialTheme === "dark") {
          setNavTheme(initialTheme);
        }
        break;
      }
    }

    /* Shrink the observer box to a 1px strip at 48px from the top of the screen */
    const bottomMargin = -(window.innerHeight - 49);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const theme = (entry.target as HTMLElement).dataset.navTheme;
            if (theme === "light" || theme === "dark") {
              setNavTheme(theme);
            }
          }
        }
      },
      {
        rootMargin: `-48px 0px ${bottomMargin}px 0px`,
        threshold: 0,
      }
    );

    /* Start watching every top-level section */
    sections.forEach((section) => observer.observe(section));

    /* Stop watching when the navbar unmounts */
    return () => observer.disconnect();
  }, []);

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
        {/* Main pill container with data-nav-theme driving all CSS color variables */}
        <nav
          data-nav-theme={navTheme}
          className="flex items-center justify-between gap-2.5 sm:gap-4 rounded-full border border-white/15 bg-white/[0.08] px-3 sm:px-4 py-2 shadow-2xl shadow-black/30 backdrop-blur-xl"
        >
          {/* Brand logo mark and title that switch colors with data-nav-theme */}
          <Link href="/" className="flex items-center gap-2 pl-1 pr-1 group">
            <Image
              src="/logo-mark-blue-bg.png"
              alt="AutoPulse logo"
              width={26}
              height={26}
              priority
              className="nav-logo-dark w-6 h-6 object-contain rounded-full"
            />
            <Image
              src="/logo-mark-white-bg.png"
              alt="AutoPulse logo"
              width={26}
              height={26}
              priority
              className="nav-logo-light w-6 h-6 object-contain rounded-full"
            />
            <span className="font-normal text-[var(--nav-text-strong)] text-sm tracking-[-0.03em] transition-colors duration-200 hidden sm:inline-block">
              AutoPulse
            </span>
          </Link>

          {/* Vertical divider between brand and navigation links */}
          <div className="h-4 w-px bg-[var(--nav-divider)] transition-colors duration-200 hidden sm:block" />

          {/* Navigation links container */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            {navItems.map((navItem, idx: number) => (
              <a
                key={`link-${idx}`}
                href={navItem.link}
                className={cn(
                  "relative flex items-center gap-1 rounded-full px-3 py-1.5 text-xs sm:text-sm font-normal text-[var(--nav-text)] transition-colors duration-200 hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-text-strong)]"
                )}
              >
                {navItem.icon && <span className="block sm:hidden">{navItem.icon}</span>}
                <span className={navItem.icon ? "hidden sm:block" : "block"}>{navItem.name}</span>
              </a>
            ))}
          </div>

          {/* Vertical divider between navigation links and auth buttons */}
          <div className="h-4 w-px bg-[var(--nav-divider)] transition-colors duration-200" />

          {/* Sign in link and Get started button */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/auth/sign-in"
              className="text-xs sm:text-sm text-[var(--nav-text)] hover:text-[var(--nav-text-strong)] transition-colors duration-200 px-2.5 py-1.5 font-normal"
            >
              Sign in
            </Link>
            <Link href="/auth/sign-up">
              <button className="relative rounded-full bg-[var(--nav-cta-bg)] px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-[var(--nav-cta-text)] transition-colors duration-200 hover:bg-[var(--nav-cta-hover-bg)]">
                <span>Get started</span>
              </button>
            </Link>
          </div>
        </nav>
      </motion.div>
    </AnimatePresence>
  );
};
