import Link from "next/link";
import { getPlans } from "@/lib/plans";
import { ScrollReveal } from "./scroll-reveal";
import { LandingPricingCards } from "./pricing-cards";

export async function Pricing() {
  const data = await getPlans();

  return (
    <section id="pricing" className="py-20 lg:py-28 border-t border-[var(--lp-border-hairline)]">
      <div className="max-w-6xl mx-auto px-5 lg:px-6">
        <ScrollReveal>
          <LandingPricingCards data={data} />
        </ScrollReveal>
      </div>
    </section>
  );
}
