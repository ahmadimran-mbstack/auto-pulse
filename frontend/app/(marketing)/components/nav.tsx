// This component renders the top navigation bar with brand logo and action links.
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

// This component shows the header navigation with links to key sections on dark hero background.
export function Nav() {
  return (
    <header className="w-full border-b border-border-dark bg-transparent">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand logo mark and title */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image
            src="/logo-mark-blue-bg.png"
            alt="AutoPulse logo"
            width={28}
            height={28}
            className="w-7 h-7 object-contain"
          />
          <span className="font-normal text-white text-base tracking-[-0.03em]">
            AutoPulse
          </span>
        </Link>

        {/* Center navigation links */}
        <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-300">
          <a
            href="#features"
            className="hover:text-white transition-colors"
          >
            Product
          </a>
          <a
            href="#how-it-works"
            className="hover:text-white transition-colors"
          >
            How it works
          </a>
          <a
            href="#faq"
            className="hover:text-white transition-colors"
          >
            FAQ
          </a>
        </nav>

        {/* Action buttons on the right side */}
        <div className="flex items-center gap-4">
          <Link
            href="/auth/sign-in"
            className="text-sm text-neutral-300 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link href="/auth/sign-up">
            <Button
              className="rounded-full bg-white text-ink hover:bg-neutral-100 px-5 h-9 text-xs sm:text-sm font-normal"
            >
              Get started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
