import type { Metadata } from "next";
import { getPlans } from "@/lib/plans";
import { Nav } from "../components/nav";
import { PricingPageClient } from "../components/pricing-page-client";
import { PricingFaq } from "../components/pricing-faq";
import { FinalCta } from "../components/final-cta";
import { Footer } from "../components/footer";

export async function generateMetadata(): Promise<Metadata> {
  const data = await getPlans();
  const trialDays = data.trial_days ?? 3;
  const planNames = data.plans.map((p) => p.name).join(", ");
  const description = `Start with a ${trialDays}-day free trial. Compare ${planNames} plans for automated LinkedIn publishing.`;

  return {
    title: "Pricing | AutoPulse",
    description,
    alternates: {
      canonical: "/pricing",
    },
    openGraph: {
      title: "Pricing | AutoPulse",
      description,
      url: "/pricing",
      type: "website",
    },
  };
}

export default async function PricingPage() {
  const data = await getPlans();

  return (
    <div className="flex flex-col min-h-screen bg-[var(--lp-bg)]">
      <div className="bg-[var(--lp-navy-deep)]">
        <Nav />
      </div>
      <main className="flex-1">
        <PricingPageClient data={data} />
        <PricingFaq trialDays={data.trial_days} pkrPerUsd={data.pkr_per_usd} />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
