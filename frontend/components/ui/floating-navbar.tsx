"use client";
import React, { useEffect, useState } from "react";
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
import { useSessionStatus } from "@/app/(marketing)/components/use-session-status";

/* Floating dark-glass pill navbar with responsive mobile dropdown menu */
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
  const { isLoaded, isSignedIn } = useSessionStatus();

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

  /* Close the mobile dropdown menu when a user taps any link */
  const handleCloseMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Dimmed backdrop behind the open mobile menu that closes it when tapped */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[4999] bg-black/50 backdrop-blur-[2px] md:hidden"
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
            duration: 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          className={cn(
            "fixed inset-x-0 mx-auto z-[5000] flex flex-col items-center justify-center px-3 md:px-4 w-full md:w-auto md:max-w-fit top-[calc(env(safe-area-inset-top)+0.75rem)] md:top-6",
            className
          )}
        >
          {/* Main dark-glass pill container using CSS variables */}
          <nav
            className="w-full md:w-auto flex items-center justify-between gap-2.5 md:gap-4 rounded-full border border-[var(--lp-nav-border)] bg-[var(--lp-nav-bg)] px-3 md:px-4 py-1 md:py-2 backdrop-blur-xl min-h-[44px]"
          >
            {/* Brand logo mark (dark variant) and title */}
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
                className="w-6 h-6 object-contain rounded-full shrink-0"
              />
              <span className="font-normal text-[var(--lp-text-heading)] text-sm tracking-[-0.03em] inline-block">
                AutoPulse
              </span>
            </Link>

            {/* Vertical divider between brand and navigation links on tablet and desktop */}
            <div className="h-4 w-px bg-[var(--lp-border)] hidden md:block" />

            {/* Navigation links container with smooth hover underline on tablet and desktop */}
            <div className="hidden md:flex items-center gap-0.5 sm:gap-1">
              {navItems.map((navItem, idx: number) => (
                <a
                  key={`link-${idx}`}
                  href={navItem.link}
                  className={cn(
                    "relative flex items-center gap-1 rounded-full px-3 py-1.5 text-xs sm:text-sm font-normal text-[var(--lp-text-body)] transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--lp-text-heading)] after:content-[''] after:absolute after:bottom-1 after:left-3 after:right-3 after:h-px after:bg-[var(--lp-ice)] after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)]"
                  )}
                >
                  {navItem.icon && <span className="block sm:hidden">{navItem.icon}</span>}
                  <span className={navItem.icon ? "hidden sm:block" : "block"}>{navItem.name}</span>
                </a>
              ))}
            </div>

            {/* Vertical divider between navigation links and auth buttons on tablet and desktop */}
            <div className="h-4 w-px bg-[var(--lp-border)] hidden md:block" />

            {/* Auth actions kept at a fixed width to avoid layout shift while session loads */}
            <div className="hidden md:flex items-center justify-end gap-1 sm:gap-2 min-w-[168px] h-8">
              {!isLoaded ? (
                <span className="inline-block h-8 w-[148px]" aria-hidden="true" />
              ) : isSignedIn ? (
                <Link href="/app">
                  <button className="relative rounded-full bg-[var(--lp-text-heading)] px-4 py-1.5 text-xs sm:text-sm font-medium text-[var(--lp-bg)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--lp-ice)] active:scale-[0.98] whitespace-nowrap">
                    <span>Go to dashboard</span>
                  </button>
                </Link>
              ) : (
                <>
                  <Link
                    href="/auth/sign-in"
                    className="relative text-xs sm:text-sm text-[var(--lp-text-body)] hover:text-[var(--lp-text-heading)] transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] px-2.5 py-1.5 font-normal after:content-[''] after:absolute after:bottom-1 after:left-2.5 after:right-2.5 after:h-px after:bg-[var(--lp-ice)] after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.22,1,0.36,1)] whitespace-nowrap"
                  >
                    Sign in
                  </Link>
                  <Link href="/auth/sign-up">
                    <button className="relative rounded-full bg-[var(--lp-text-heading)] px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-[var(--lp-bg)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--lp-ice)] active:scale-[0.98] whitespace-nowrap">
                      <span>Get started</span>
                    </button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile menu toggle button with 44px tap target */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[var(--lp-text-heading)] hover:bg-white/10 transition-colors duration-200"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </nav>

          {/* Full-width dark dropdown menu under the pill on mobile screens */}
          {mobileMenuOpen && (
            <div
              className="md:hidden mt-2 w-full rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-menu-bg)] p-3 backdrop-blur-xl flex flex-col gap-1 transition-colors duration-200"
            >
              {/* Mobile section links */}
              {navItems.map((navItem, idx: number) => (
                <a
                  key={`mobile-link-${idx}`}
                  href={navItem.link}
                  onClick={handleCloseMobileMenu}
                  className="min-h-[44px] flex items-center px-3 rounded-xl text-[15px] font-normal text-[var(--lp-text-body)] hover:text-[var(--lp-text-heading)] hover:bg-white/5 transition-colors duration-200"
                >
                  {navItem.name}
                </a>
              ))}

              {/* Divider separating section links from auth actions */}
              <div className="h-px w-full bg-[var(--lp-border-hairline)] my-1.5" />

              {isSignedIn ? (
                <Link href="/app" onClick={handleCloseMobileMenu} className="mt-1">
                  <button className="w-full min-h-[44px] rounded-full bg-[var(--lp-text-heading)] px-4 py-2.5 text-[15px] font-medium text-[var(--lp-bg)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--lp-ice)] active:scale-[0.98]">
                    Go to dashboard
                  </button>
                </Link>
              ) : (
                <>
                  {/* Mobile Sign in link */}
                  <Link
                    href="/auth/sign-in"
                    onClick={handleCloseMobileMenu}
                    className="min-h-[44px] flex items-center px-3 rounded-xl text-[15px] font-normal text-[var(--lp-text-body)] hover:text-[var(--lp-text-heading)] hover:bg-white/5 transition-colors duration-200"
                  >
                    Sign in
                  </Link>

                  {/* Full-width Get started button */}
                  <Link href="/auth/sign-up" onClick={handleCloseMobileMenu} className="mt-1">
                    <button className="w-full min-h-[44px] rounded-full bg-[var(--lp-text-heading)] px-4 py-2.5 text-[15px] font-medium text-[var(--lp-bg)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--lp-ice)] active:scale-[0.98]">
                      Get started
                    </button>
                  </Link>
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
};
