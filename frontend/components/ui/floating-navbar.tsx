"use client";
import React, { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
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

  /* Track whether the mobile dropdown menu is open */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* Store the single theme value ("dark" or "light") from the section behind the navbar */
  const [navTheme, setNavTheme] = useState<"dark" | "light">("dark");

  /* Show the navbar at the top or when scrolling up, and hide it when scrolling down */
  useMotionValueEvent(scrollYProgress, "change", (current) => {
    if (typeof current === "number") {
      const direction = current - scrollYProgress.getPrevious()!;

      if (mobileMenuOpen || scrollYProgress.get() < 0.05) {
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

  /* Lock page scrolling while the mobile menu is open and close it on Escape or resize */
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [mobileMenuOpen]);

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

  /* Close the mobile dropdown menu when a user taps any link */
  const handleCloseMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Dimmed backdrop behind the open mobile menu that closes it when tapped */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[4999] bg-black/35 backdrop-blur-[2px] md:hidden"
          onClick={handleCloseMobileMenu}
          aria-hidden="true"
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          initial={{
            opacity: 1,
            y: 0,
          }}
          animate={{
            y: visible || mobileMenuOpen ? 0 : -100,
            opacity: visible || mobileMenuOpen ? 1 : 0,
          }}
          transition={{
            duration: 0.25,
            ease: "easeInOut",
          }}
          className={cn(
            "fixed inset-x-0 mx-auto z-[5000] flex flex-col items-center justify-center px-3 md:px-4 w-full md:w-auto md:max-w-fit top-[calc(env(safe-area-inset-top)+0.75rem)] md:top-6",
            className
          )}
        >
          {/* Main pill container with data-nav-theme driving all CSS color variables */}
          <nav
            data-nav-theme={navTheme}
            className="w-full md:w-auto flex items-center justify-between gap-2.5 md:gap-4 rounded-full border border-white/15 bg-white/[0.08] px-3 md:px-4 py-1 md:py-2 shadow-2xl shadow-black/30 backdrop-blur-xl min-h-[44px]"
          >
            {/* Brand logo mark and title that switch colors with data-nav-theme */}
            <Link
              href="/"
              onClick={handleCloseMobileMenu}
              className="flex items-center gap-2 pl-1 pr-1 min-h-[44px] md:min-h-0 group"
            >
              <Image
                src="/logo-mark-blue-bg.png"
                alt="AutoPulse logo"
                width={26}
                height={26}
                priority
                className="nav-logo-dark w-6 h-6 object-contain rounded-full shrink-0"
              />
              <Image
                src="/logo-mark-white-bg.png"
                alt="AutoPulse logo"
                width={26}
                height={26}
                priority
                className="nav-logo-light w-6 h-6 object-contain rounded-full shrink-0"
              />
              <span className="font-normal text-[var(--nav-text-strong)] text-sm tracking-[-0.03em] transition-colors duration-200 inline-block">
                AutoPulse
              </span>
            </Link>

            {/* Vertical divider between brand and navigation links on tablet and desktop */}
            <div className="h-4 w-px bg-[var(--nav-divider)] transition-colors duration-200 hidden md:block" />

            {/* Navigation links container shown on tablet and desktop */}
            <div className="hidden md:flex items-center gap-0.5 sm:gap-1">
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

            {/* Vertical divider between navigation links and auth buttons on tablet and desktop */}
            <div className="h-4 w-px bg-[var(--nav-divider)] transition-colors duration-200 hidden md:block" />

            {/* Sign in link and Get started button shown on tablet and desktop */}
            <div className="hidden md:flex items-center gap-1 sm:gap-2">
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

            {/* Mobile menu toggle button with 44px tap target */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[var(--nav-text-strong)] hover:bg-[var(--nav-hover-bg)] transition-colors duration-200"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </nav>

          {/* Full-width dropdown menu under the pill on mobile screens */}
          {mobileMenuOpen && (
            <div
              data-nav-theme={navTheme}
              className="md:hidden mt-2 w-full rounded-2xl border border-[var(--nav-menu-border)] bg-[var(--nav-menu-bg)] p-3 shadow-2xl shadow-black/25 backdrop-blur-xl flex flex-col gap-1 transition-colors duration-200"
            >
              {/* Mobile section links */}
              {navItems.map((navItem, idx: number) => (
                <a
                  key={`mobile-link-${idx}`}
                  href={navItem.link}
                  onClick={handleCloseMobileMenu}
                  className="min-h-[44px] flex items-center px-3 rounded-xl text-[15px] font-normal text-[var(--nav-text)] hover:text-[var(--nav-text-strong)] hover:bg-[var(--nav-hover-bg)] transition-colors duration-200"
                >
                  {navItem.name}
                </a>
              ))}

              {/* Divider separating section links from auth actions */}
              <div className="h-px w-full bg-[var(--nav-divider)] my-1.5" />

              {/* Mobile Sign in link */}
              <Link
                href="/auth/sign-in"
                onClick={handleCloseMobileMenu}
                className="min-h-[44px] flex items-center px-3 rounded-xl text-[15px] font-normal text-[var(--nav-text)] hover:text-[var(--nav-text-strong)] hover:bg-[var(--nav-hover-bg)] transition-colors duration-200"
              >
                Sign in
              </Link>

              {/* Full-width Get started button */}
              <Link href="/auth/sign-up" onClick={handleCloseMobileMenu} className="mt-1">
                <button className="w-full min-h-[44px] rounded-full bg-[var(--nav-cta-bg)] px-4 py-2.5 text-[15px] font-medium text-[var(--nav-cta-text)] transition-colors duration-200 hover:bg-[var(--nav-cta-hover-bg)]">
                  Get started
                </button>
              </Link>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
};
