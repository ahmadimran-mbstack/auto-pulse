// This page component assembles the nine sections of the AutoPulse landing page.
import React from "react";
import { Nav } from "./components/nav";
import { Hero } from "./components/hero";
import { ThreeFacts } from "./components/facts";
import { PipelineMap } from "./components/pipeline-map";
import { FeatureRows } from "./components/feature-rows";
import { OneRealRun } from "./components/one-real-run";
import { WhoItsFor } from "./components/who-its-for";
import { GetStarted } from "./components/get-started";
import { BentoGrid } from "./components/bento-grid";
import { Pricing } from "./components/pricing";
import { Faq } from "./components/faq";
import { FinalCta } from "./components/final-cta";
import { Footer } from "./components/footer";

// This component renders the complete landing page in the exact ordered sequence.
export default function MarketingPage() {
  return (
    /* Main landing page container on forced-dark #08090C background */
    <div className="flex flex-col min-h-screen bg-[var(--lp-bg)]">
      {/* 1. Nav and 2. Hero on dark navy-deep canvas */}
      <div className="bg-[var(--lp-navy-deep)]">
        <Nav />
        <Hero />
      </div>

      <main className="flex-1">
        {/* 3. Three plain facts */}
        <ThreeFacts />

        {/* 3B. The pipeline map */}
        <PipelineMap />

        {/* 4. Feature rows with alternating mock cards and grainy gradient panels */}
        <FeatureRows />

        {/* 4B. One real run (renders only when verified) */}
        <OneRealRun />

        {/* 4C. Who it's for */}
        <WhoItsFor />

        {/* 5. Get started in three steps */}
        <GetStarted />

        {/* 6. Bento grid safety and roadmap cards */}
        <BentoGrid />

        {/* 6B. Public pricing section */}
        <Pricing />

        {/* 7. Frequently asked questions accordion */}
        <Faq />

        {/* 8. Final call to action on navy-deep canvas */}
        <FinalCta />
      </main>

      {/* 9. Site footer on navy-deep canvas */}
      <Footer />
    </div>
  );
}
