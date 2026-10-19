"use client";

import * as Accordion from "@radix-ui/react-accordion";

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
    <Accordion.Root type="single" collapsible className="w-full space-y-3">
      {items.map((item) => (
        <Accordion.Item
          key={item.id}
          value={item.id}
          className="border border-line rounded-[10px] bg-surface overflow-hidden transition-all duration-200 hover:border-signal/30 card-subtle-shadow"
        >
          <Accordion.Header className="flex">
            <Accordion.Trigger className="flex flex-1 items-center justify-between text-left text-base font-medium text-ink hover:text-signal transition-colors cursor-pointer group px-5 py-4">
              <span className="font-geist font-normal tracking-tighter text-lg pr-4">
                {item.question}
              </span>
              <div className="w-7 h-7 rounded-full bg-paper border border-line flex items-center justify-center shrink-0 text-muted group-hover:text-signal group-hover:border-signal/40 transition-colors">
                <svg
                  className="w-3.5 h-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="px-5 pt-1 pb-5 text-sm text-muted leading-relaxed border-t border-line/60 bg-paper/40">
            <p className="max-prose-copy">{item.answer}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
