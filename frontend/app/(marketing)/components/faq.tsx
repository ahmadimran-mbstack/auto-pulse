// This component displays the frequently asked questions using an accessible accordion and scroll reveal.
"use client";

import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { ScrollReveal } from "./scroll-reveal";

// Verified question and answer list sourced strictly from confirmed product facts
const faqItems = [
  {
    id: "item-1",
    question: "How does approval work?",
    answer:
      "Each draft is sent by email with a link that opens a page, and you press the button there. Slack approval also works.",
  },
  {
    id: "item-2",
    question: "Which platforms are supported?",
    answer: "LinkedIn at launch. Instagram and Facebook are coming.",
  },
  {
    id: "item-3",
    question: "What happens when my LinkedIn connection expires?",
    answer:
      "LinkedIn connections last 60 days and cannot be refreshed, so you reconnect and AutoPulse reminds you by email.",
  },
  {
    id: "item-4",
    question: "How are drafts checked?",
    answer:
      "Each draft gets an AI-writing score and is rewritten until it is under 15 out of 100.",
  },
  {
    id: "item-5",
    question: "How do I start?",
    answer: "Connect LinkedIn, complete onboarding, approve your first post.",
  },
];

// This component renders the FAQ section with quiet typography and hairline borders.
export function Faq() {
  return (
    <section id="faq" className="bg-paper py-16 md:py-24 border-t border-border-light">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <ScrollReveal>
          {/* Section title */}
          <div className="mb-10 text-left">
            <h2 className="landing-heading text-3xl sm:text-4xl text-ink">
              Frequently Asked Questions
            </h2>
            <p className="mt-3 text-base text-text-muted-light font-normal">
              Clear facts on how drafts are checked, delivered, and approved.
            </p>
          </div>

          {/* Accordion container with hairline item dividers */}
          <div className="border-t border-border-light">
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item) => (
                <AccordionItem
                  key={item.id}
                  value={item.id}
                  className="border-b border-border-light py-2"
                >
                  <AccordionTrigger className="text-left text-base sm:text-lg font-normal text-ink hover:no-underline hover:text-navy transition-colors py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/50 rounded-md">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-text-muted-light font-normal leading-relaxed pb-4">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
