"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqSectionProps {
  contactEmail?: string;
}

export function FaqSection({ contactEmail = "" }: FaqSectionProps = {}) {
  void contactEmail;
  // Five core questions answering verification and safety
  const faqItems = [
    {
      id: "item-1",
      question: "Does AutoPulse post without my approval?",
      answer: "No, every post waits for your approval.",
    },
    {
      id: "item-2",
      question: "Why not just use ChatGPT?",
      answer:
        "A chat starts blank each time. AutoPulse searches fresh news every day, writes in your saved tone and brand, makes the image, asks you to approve, and posts at your chosen time.",
    },
    {
      id: "item-3",
      question: "Will it sound like AI?",
      answer:
        "Posts follow your tone and sample posts, are checked against a list of stock phrases, and you approve each one before it goes out.",
    },
    {
      id: "item-4",
      question: "Is it safe to connect LinkedIn?",
      answer:
        "We use LinkedIn's official API, post only after you approve, and you can disconnect at any time.",
    },
    {
      id: "item-5",
      question: "How do I delete my data?",
      answer:
        "Use Delete account in Settings. Posts already on LinkedIn stay there.",
    },
  ];

  return (
    <Accordion type="single" collapsible className="w-full space-y-3">
      {faqItems.map((item) => (
        <AccordionItem
          key={item.id}
          value={item.id}
          className="border border-border rounded-lg bg-card px-5 py-1 text-left"
        >
          <AccordionTrigger className="text-left font-medium text-base hover:text-primary transition-colors py-4">
            <span className="font-semibold text-foreground pr-4 text-left">
              {item.question}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-body text-muted-foreground leading-relaxed pt-1 pb-4">
            <p>{item.answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
