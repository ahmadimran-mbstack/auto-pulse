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
import {
  LinkedInIcon,
  SlackIcon,
  GmailIcon,
  InstagramIcon,
  FacebookIcon,
} from "./platform-icons";

// Verified question and answer list sourced strictly from confirmed product facts
const faqItems: {
  id: string;
  question: React.ReactNode;
  answer: React.ReactNode;
}[] = [
  {
    id: "item-1",
    question: "How does approval work?",
    answer: (
      <span>
        Each draft is sent by{" "}
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <GmailIcon className="w-3.5 h-3.5 shrink-0" />
          <span>email</span>
        </span>{" "}
        with a link that opens a page, and you press the button there.{" "}
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <SlackIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Slack</span>
        </span>{" "}
        approval also works.
      </span>
    ),
  },
  {
    id: "item-2",
    question: "Which platforms are supported?",
    answer: (
      <span>
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
          <span>LinkedIn</span>
        </span>{" "}
        at launch.{" "}
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <InstagramIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Instagram</span>
        </span>{" "}
        and{" "}
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <FacebookIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Facebook</span>
        </span>{" "}
        are coming.
      </span>
    ),
  },
  {
    id: "item-3",
    question: (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span>What happens when my</span>
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <LinkedInIcon className="w-4 h-4 shrink-0" />
          <span>LinkedIn</span>
        </span>
        <span>connection expires?</span>
      </span>
    ),
    answer: (
      <span>
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
          <span>LinkedIn</span>
        </span>{" "}
        connections last 60 days and cannot be refreshed, so you reconnect and AutoPulse reminds you by{" "}
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <GmailIcon className="w-3.5 h-3.5 shrink-0" />
          <span>email</span>
        </span>
        .
      </span>
    ),
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
    answer: (
      <span>
        Connect{" "}
        <span className="inline-flex items-center gap-1 font-normal text-ink">
          <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
          <span>LinkedIn</span>
        </span>
        , complete onboarding, approve your first post.
      </span>
    ),
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
            <h2 className="landing-heading text-4xl sm:text-5xl text-ink">
              Frequently Asked Questions
            </h2>
            <p className="mt-3 text-base sm:text-lg text-text-muted-light font-normal">
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
                  <AccordionTrigger className="text-left text-lg sm:text-xl font-normal text-ink hover:no-underline hover:text-navy transition-colors py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/50 rounded-md">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm sm:text-base text-text-muted-light font-normal leading-relaxed pb-4">
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
