// This component displays the frequently asked questions using an accessible accordion and scroll reveal.
"use client";

import React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { Plus } from "lucide-react";
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
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
            <GmailIcon className="w-3.5 h-3.5 shrink-0" />
            <span>email</span>
          </span>{" "}
          with a link that opens a page, and you press the button there.{" "}
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
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
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
            <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
            <span>LinkedIn</span>
          </span>{" "}
          at launch.{" "}
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
            <InstagramIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Instagram</span>
          </span>{" "}
          and{" "}
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
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
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
            <LinkedInIcon className="w-4 h-4 shrink-0" />
            <span>LinkedIn</span>
          </span>
          <span>connection expires?</span>
        </span>
      ),
      answer: (
        <span>
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
            <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
            <span>LinkedIn</span>
          </span>{" "}
          connections last 60 days and cannot be refreshed, so you reconnect and AutoPulse reminds you by{" "}
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
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
          <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
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
    /* Forced-dark FAQ section on #08090C canvas with 64px mobile vertical spacing */
    <section
      id="faq"
      className="bg-[var(--lp-bg)] py-16 lg:py-24 border-t border-[var(--lp-border-hairline)]"
    >
      {/* Consistent 20px mobile container padding matching all other sections */}
      <div className="max-w-6xl lg:max-w-3xl mx-auto px-5 lg:px-6">
        <ScrollReveal>
          {/* Section title */}
          <div className="mb-8 lg:mb-10 text-left">
            <p className="landing-heading text-[clamp(1.75rem,7vw,2.5rem)] lg:text-5xl text-[var(--lp-text-heading)]">
              Frequently Asked Questions
            </p>
            <p className="mt-3 text-[15px] lg:text-lg text-[var(--lp-text-muted)] font-normal">
              Clear facts on how drafts are checked, delivered, and approved.
            </p>
          </div>

          {/* Radix Accordion with smooth grid-template-rows height, rotating plus icon, and brightening open border */}
          <div className="border-t border-[var(--lp-border-hairline)]">
            <AccordionPrimitive.Root type="single" collapsible className="w-full">
              {faqItems.map((item) => (
                <AccordionPrimitive.Item
                  key={item.id}
                  value={item.id}
                  className="group/item border-b border-[var(--lp-border-hairline)] data-[state=open]:border-[var(--lp-border-hover)] transition-colors duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] py-1 lg:py-2"
                >
                  <AccordionPrimitive.Header className="flex">
                    <AccordionPrimitive.Trigger className="w-full min-h-[44px] flex items-center justify-between gap-4 text-left text-base lg:text-xl font-normal text-[var(--lp-text-heading)] hover:text-[var(--lp-ice)] transition-colors duration-200 py-3.5 lg:py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)] rounded-md cursor-pointer">
                      <span>{item.question}</span>
                      {/* Plus icon that rotates 45deg into an X when open */}
                      <Plus
                        aria-hidden="true"
                        className="w-4 h-4 shrink-0 text-[var(--lp-text-muted)] group-data-[state=open]/item:text-[var(--lp-ice)] transition-transform duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]/item:rotate-45 motion-reduce:transition-none"
                      />
                    </AccordionPrimitive.Trigger>
                  </AccordionPrimitive.Header>

                  {/* Smooth height transition using CSS grid-template-rows 0fr -> 1fr */}
                  <AccordionPrimitive.Content
                    forceMount
                    className="grid data-[state=open]:grid-rows-[1fr] data-[state=closed]:grid-rows-[0fr] data-[state=closed]:invisible transition-[grid-template-rows,visibility] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  >
                    <div className="overflow-hidden">
                      <div className="text-[15px] lg:text-base text-[var(--lp-text-body)] font-normal leading-relaxed pb-4 opacity-0 translate-y-2 group-data-[state=open]/item:opacity-100 group-data-[state=open]/item:translate-y-0 transition-all duration-[350ms] delay-75 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:translate-y-0 motion-reduce:delay-0 motion-reduce:duration-200">
                        {item.answer}
                      </div>
                    </div>
                  </AccordionPrimitive.Content>
                </AccordionPrimitive.Item>
              ))}
            </AccordionPrimitive.Root>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
