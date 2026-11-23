"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollReveal } from "./scroll-reveal";

const PRICING_FAQ_ITEMS = [
  {
    id: "trial",
    question: "What happens after the 3-day trial?",
    answer:
      "Your account pauses and nothing is posted until you choose a plan. Your profile and settings stay saved.",
  },
  {
    id: "payment",
    question: "How do I pay?",
    answer:
      "Payments are in PKR through Easypaisa and JazzCash. Prices are shown in USD, with the Rs amount at about Rs 280 per dollar.",
  },
  {
    id: "change-plan",
    question: "Can I change plans?",
    answer:
      "Upgrades start right away with a new 30-day period. Downgrades start when your current period ends.",
  },
  {
    id: "counting",
    question: "What counts as a post or a Playground run?",
    answer:
      "A post is one AI draft made for your schedule, including the \"Generate today's post\" button. A Playground run is one on-demand run. Failed runs do not count.",
  },
  {
    id: "approval",
    question: "Will AutoPulse post without my approval?",
    answer:
      "No. Every draft needs your approval by email, or in Slack on Pro and Business, before it is published.",
  },
  {
    id: "platforms",
    question: "Do you support Instagram and Facebook?",
    answer:
      "Not yet. They are waiting for platform review and are marked coming soon. AutoPulse publishes to LinkedIn today.",
  },
];

export function PricingFaq() {
  return (
    <section
      id="pricing-faq"
      className="py-16 md:py-24 border-t border-[var(--lp-border-hairline)]"
    >
      <div className="max-w-3xl mx-auto px-5 lg:px-6">
        <ScrollReveal>
          <div className="mb-10 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-normal tracking-tight text-balance text-[var(--lp-text-heading)]">
              Frequently asked questions
            </h2>
            <p className="text-sm text-[var(--lp-text-muted)]">
              Clear answers about trials, billing, and how runs are counted.
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full border-t border-[var(--lp-border-hairline)]">
            {PRICING_FAQ_ITEMS.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-b border-[var(--lp-border-hairline)]"
              >
                <AccordionTrigger className="text-left text-base font-normal text-[var(--lp-text-heading)] hover:text-[var(--lp-ice)] hover:no-underline py-4">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-[var(--lp-text-muted)] leading-relaxed pb-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollReveal>
      </div>
    </section>
  );
}
