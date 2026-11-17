// This component renders the site footer with brand mark, navigation links, and legal notices.
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { LinkedInIcon } from "./platform-icons";

// This component provides the quiet dark footer on navy-deep background.
export function Footer() {
  return (
    /* Quiet dark footer on #001740 navy-deep canvas */
    <footer
      className="bg-[var(--lp-navy-deep)] text-[var(--lp-text-muted)] py-16 border-t border-[var(--lp-border-hairline)] text-sm"
    >
      {/* Consistent 20px mobile container padding */}
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        {/* Two-column link layout under the brand summary on mobile, 12-column grid on md+ */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10 pb-10 lg:pb-12 border-b border-[var(--lp-border-hairline)]">
          {/* Brand mark and brief summary */}
          <div className="col-span-2 md:col-span-6 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo-mark-blue-bg.png"
                alt="AutoPulse logo"
                width={24}
                height={24}
                className="w-6 h-6 object-contain"
              />
              <span className="font-normal text-[var(--lp-text-heading)] text-base tracking-tight">
                AutoPulse
              </span>
            </Link>
            <p className="text-[15px] lg:text-xs text-[var(--lp-text-muted)] max-w-sm leading-relaxed font-normal">
              Automated topic research, draft generation, and quality checking for LinkedIn. Every post requires your explicit approval.
            </p>
          </div>

          {/* First column: Product navigation */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <div className="text-xs font-normal text-[var(--lp-text-heading)] uppercase tracking-wider">
              Product
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#features" className="hover:text-[var(--lp-ice)] transition-colors duration-200">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-[var(--lp-ice)] transition-colors duration-200">
                  How it works
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[var(--lp-ice)] transition-colors duration-200">
                  FAQ
                </a>
              </li>
              <li>
                <Link href="/auth/sign-in" className="hover:text-[var(--lp-ice)] transition-colors duration-200">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/auth/sign-up" className="hover:text-[var(--lp-ice)] transition-colors duration-200">
                  Get started
                </Link>
              </li>
            </ul>
          </div>

          {/* Second column: Legal pages */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <div className="text-xs font-normal text-[var(--lp-text-heading)] uppercase tracking-wider">
              Legal
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/privacy" className="hover:text-[var(--lp-ice)] transition-colors duration-200">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-[var(--lp-ice)] transition-colors duration-200">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright notice stacked and left-aligned on mobile */}
        <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-[var(--lp-text-muted)] gap-3 sm:gap-4">
          <p>(c) 2026 MB Stack. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
            <span>LinkedIn is a trademark of LinkedIn Corporation.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
