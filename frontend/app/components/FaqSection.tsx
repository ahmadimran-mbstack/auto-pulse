"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FaqSectionProps {
  contactEmail: string;
}

export function FaqSection({ contactEmail }: FaqSectionProps) {
  const items = [
    {
      id: "item-1",
      question: "Does AutoPulse ever post without my explicit approval?",
      answer:
        "Never. AutoPulse has zero automated publishing bypasses. Every single post, image, and caption enters your pending queue. If you do not click 'Approve', nothing is ever sent to LinkedIn.",
    },
    {
      id: "item-2",
      question: "Does AutoPulse see or store my LinkedIn password?",
      answer:
        "No. AutoPulse uses the official LinkedIn OAuth 2.0 API. You sign in directly on LinkedIn's official authorization screen and grant posting permissions. We never see, handle, or store your password.",
    },
    {
      id: "item-3",
      question: "Can I edit the post before approving it?",
      answer:
        "Yes. You can edit any sentence, change hashtags, or request a complete rewrite with a different angle directly from your dashboard in seconds.",
    },
    {
      id: "item-4",
      question: "Which social accounts are supported?",
      answer:
        "LinkedIn personal profiles and LinkedIn company pages are fully supported today. X (Twitter), Facebook, and Instagram connectors are currently in closed beta testing.",
    },
    {
      id: "item-5",
      question: "How do I cancel or delete my account and data?",
      answer: `You can disconnect LinkedIn with one click at any time. To permanently delete your account and all generated drafts, click 'Delete Account' in your dashboard or email ${contactEmail}. All data is erased within 24 hours.`,
    },
  ];

  return (
    <Accordion type="single" collapsible className="w-full space-y-3">
      {items.map((item) => (
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
          <AccordionContent className="text-sm text-muted-foreground leading-relaxed pt-1 pb-4">
            <p>{item.answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
