import type { Metadata } from "next";
import { getPlans } from "@/lib/plans";
import { Nav } from "../components/nav";
import { PricingPageClient } from "../components/pricing-page-client";
import { PricingFaq } from "../components/pricing-faq";
import { FinalCta } from "../components/final-cta";
import { Footer } from "../components/footer";

export const metadata: Metadata = {
  title: "Pricing | AutoPulse",
  description:
    "Start with a 3-day free trial. Compare Free trial, Starter, Pro, and Business plans for automated LinkedIn publishing.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing | AutoPulse",
    description:
      "Start with a 3-day free trial. Compare Free trial, Starter, Pro, and Business plans for automated LinkedIn publishing.",
    url: "/pricing",
    type: "website",
  },
};

export default async function PricingPage() {
  const data = await getPlans();

  return (
    <div className="flex flex-col min-h-screen bg-[var(--lp-bg)]">
      <div className="bg-[var(--lp-navy-deep)]">
        <Nav />
      </div>
      <main className="flex-1">
        <PricingPageClient data={data} />
        <PricingFaq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
