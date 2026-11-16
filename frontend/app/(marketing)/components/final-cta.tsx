// This component displays the closing call to action on navy-deep canvas with scroll reveal and subtle cropped branding.
"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import PixelBlast from "@/components/PixelBlast";
import { ScrollReveal } from "./scroll-reveal";
import { LinkedInIcon } from "./platform-icons";

// This component renders the final conversion section with a white pill button on navy-deep background.
export function FinalCta() {
  return (
    /* Mark the final CTA as dark and use 64px mobile vertical spacing */
    <section
      data-nav-theme="dark"
      className="relative overflow-hidden bg-navy-deep text-white py-16 lg:py-32 border-t border-border-dark"
    >
      {/* Huge cropped faceted logo mark at 5 to 6 percent opacity (allowed in hero and final CTA only) */}
      <div
        className="pointer-events-none absolute -right-24 -bottom-32 sm:-right-36 sm:-bottom-44 w-[420px] sm:w-[600px] h-[420px] sm:h-[600px] select-none opacity-[0.055]"
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

      {/* WebGL PixelBlast background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <PixelBlast
          variant="square"
          color="#1A56B8"
          accentColor="#BFD2EE"
          transparent={true}
          pixelSize={4}
          patternScale={2}
          glow={0.5}
        />
      </div>

      {/* Consistent 20px mobile container padding */}
      <div className="relative z-10 max-w-5xl mx-auto px-5 lg:px-6 text-center">
        <ScrollReveal>
          {/* Main closing headline scaled smoothly with clamp on mobile */}
          <p className="landing-heading text-[clamp(2rem,8.5vw,3.5rem)] md:text-7xl lg:text-[76px] text-white max-w-6xl mx-auto flex items-center justify-center flex-wrap gap-x-2.5 sm:gap-x-3 gap-y-2">
            <span>Let your</span>
            <span className="inline-flex items-center gap-2 sm:gap-2.5">
              <LinkedInIcon className="w-7 h-7 sm:w-11 sm:h-11 md:w-14 md:h-14 lg:w-16 lg:h-16 shrink-0" />
              <span>LinkedIn</span>
            </span>
            <span>run itself</span>
          </p>

          {/* Quiet supporting text at least 15px on mobile */}
          <p className="mt-5 lg:mt-6 text-[15px] sm:text-lg lg:text-xl text-text-muted-dark max-w-2xl mx-auto font-normal leading-relaxed">
            Daily drafts prepared from your profile and current industry topics. You approve each one before it goes live.
          </p>

          {/* Full-width button on mobile, centered pill button on tablet and desktop */}
          <div className="mt-8 flex justify-center">
            <Link href="/auth/sign-up" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto rounded-full bg-white text-ink hover:bg-neutral-100 px-8 h-12 min-h-[44px] text-[15px] lg:text-base font-normal">
                Get started
              </Button>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
