// This component renders the site footer with brand mark, navigation links, and legal notices.
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { LinkedInIcon } from "./platform-icons";

// This component provides the quiet dark footer on navy-deep background.
export function Footer() {
  return (
    /* Mark the footer as dark so the floating navbar stays in light text */
    <footer
      data-nav-theme="dark"
      className="bg-navy-deep text-text-muted-dark py-16 border-t border-border-dark text-sm"
    >
      {/* Consistent 20px mobile container padding */}
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        {/* Two-column link layout under the brand summary on mobile, 12-column grid on md+ */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10 pb-10 lg:pb-12 border-b border-border-dark">
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
              <span className="font-normal text-white text-base tracking-tight">
                AutoPulse
              </span>
            </Link>
            <p className="text-[15px] lg:text-xs text-text-muted-dark max-w-sm leading-relaxed font-normal">
              Automated topic research, draft generation, and quality checking for LinkedIn. Every post requires your explicit approval.
            </p>
          </div>

          {/* First column: Product navigation */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <div className="text-xs font-normal text-white uppercase tracking-wider">
              Product
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  How it works
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-white transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <Link href="/auth/sign-in" className="hover:text-white transition-colors">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/auth/sign-up" className="hover:text-white transition-colors">
                  Get started
                </Link>
              </li>
            </ul>
          </div>

          {/* Second column: Legal pages */}
          <div className="col-span-1 md:col-span-3 space-y-3">
            <div className="text-xs font-normal text-white uppercase tracking-wider">
              Legal
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright notice stacked and left-aligned on mobile */}
        <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-text-muted-dark gap-3 sm:gap-4">
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
