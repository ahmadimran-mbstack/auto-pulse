// Public Terms of Service page for AutoPulse
// Outlines service description, user responsibilities, AI content notices, and connection rules
import React from "react";
import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/legal/LegalShell";
import {
  LEGAL_CONFIG,
  COMPANY_NAME,
  PRODUCT_NAME,
  CONTACT_EMAIL,
  GOVERNING_LAW,
} from "@/lib/legal-config";

// Page metadata for search engines and social cards
export const metadata: Metadata = {
  title: `Terms of Service | ${PRODUCT_NAME}`,
  description:
    "Read the terms governing the use of AutoPulse, LinkedIn publishing rules, and user approval responsibilities.",
  robots: {
    index: true,
    follow: true,
  },
};

// Section headers for the sticky table of contents
const SECTIONS: LegalSection[] = [
  { id: "agreement", title: "1. Agreement" },
  { id: "what-autopulse-does", title: "2. What AutoPulse does" },
  { id: "your-account", title: "3. Your account" },
  { id: "linkedin-and-connections", title: "4. LinkedIn and other connections" },
  { id: "content-and-approvals", title: "5. Your content and your approvals" },
  { id: "ai-content", title: "6. AI-generated content" },
  { id: "acceptable-use", title: "7. Acceptable use" },
  { id: "availability", title: "8. Availability and changes" },
  { id: "ownership", title: "9. Ownership and permissions" },
  { id: "ending-account", title: "10. Ending your account" },
  { id: "disclaimers", title: "11. Disclaimers" },
  { id: "liability-limits", title: "12. Limits on our liability" },
  { id: "governing-law", title: "13. Governing law" },
  { id: "terms-changes", title: "14. Changes to these terms" },
  { id: "contact", title: "15. Contact" },
];

// Main component rendering the complete Terms of Service document
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" sections={SECTIONS}>
      {/* Section 1: Agreement */}
      <section id="agreement" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          1. Agreement
        </h2>
        <p className="text-muted-foreground">
          By signing up, connecting an account, or using {PRODUCT_NAME}, you agree to these Terms of
          Service between you and {COMPANY_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
        </p>
        <p className="text-muted-foreground">
          If you do not agree to these terms, you must not access or use {PRODUCT_NAME}.
        </p>
      </section>

      {/* Section 2: What AutoPulse does */}
      <section id="what-autopulse-does" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          2. What AutoPulse does
        </h2>
        <p className="text-muted-foreground">
          {PRODUCT_NAME} provides software tools that help you draft and publish posts on LinkedIn.
        </p>
        <p className="text-muted-foreground">
          The service searches public industry news, writes proposed drafts with AI models, evaluates draft
          quality, and sends drafts to you for review by email link or Slack. Once you approve a draft,
          {PRODUCT_NAME} publishes the post directly to your connected LinkedIn profile.
        </p>
      </section>

      {/* Section 3: Your account */}
      <section id="your-account" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          3. Your account
        </h2>
        <p className="text-muted-foreground">
          You must provide true and accurate information (name and email) when creating an account through
          Neon Auth.
        </p>
        <p className="text-muted-foreground">
          You are responsible for keeping your account credentials confidential and for all activities that
          occur under your account. If you believe your account has been compromised, notify us immediately
          at {CONTACT_EMAIL}.
        </p>
      </section>

      {/* Section 4: LinkedIn and other connections */}
      <section id="linkedin-and-connections" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          4. LinkedIn and other connections
        </h2>
        <p className="text-muted-foreground">
          When you connect your LinkedIn profile or Slack workspace, you give {PRODUCT_NAME} permission to
          interact with those services on your behalf:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>You must follow LinkedIn&apos;s User Agreement and Community Policies at all times.</li>
          <li>
            LinkedIn OAuth tokens last for 60 days and cannot be refreshed automatically. When a token
            expires, you must reconnect your profile to continue publishing.
          </li>
          <li>
            We publish posts to LinkedIn only after you explicitly click approve. We never publish without
            your manual sign-off.
          </li>
          <li>
            You can disconnect LinkedIn or Slack at any time in your AutoPulse settings or directly within
            the respective platforms.
          </li>
        </ul>
      </section>

      {/* Section 5: Your content and your approvals */}
      <section id="content-and-approvals" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          5. Your content and your approvals
        </h2>
        <p className="text-muted-foreground">
          You are solely responsible for every post published to your LinkedIn profile through {PRODUCT_NAME}.
        </p>
        <p className="text-muted-foreground">
          You must read and review each post draft before approving it. When you click approve, you direct
          {PRODUCT_NAME} to publish that post to your public professional profile.
        </p>
      </section>

      {/* Section 6: AI-generated content */}
      <section id="ai-content" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          6. AI-generated content
        </h2>
        <p className="text-muted-foreground">
          Post drafts are written by artificial intelligence models. AI output can contain errors, outdated
          facts, hallucinated details, or inappropriate tone.
        </p>
        <p className="text-muted-foreground">
          You must check all facts, claims, metrics, and references before approving any post. We do not
          guarantee that drafts will be error-free or that published posts will achieve specific reach,
          views, engagement, or business growth.
        </p>
      </section>

      {/* Section 7: Acceptable use */}
      <section id="acceptable-use" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          7. Acceptable use
        </h2>
        <p className="text-muted-foreground">
          You agree to use {PRODUCT_NAME} lawfully and responsibly. You must not use the service to:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>Create or publish spam, deceptive messages, or fraudulent claims.</li>
          <li>Publish hate speech, harassment, defamation, or illegal materials.</li>
          <li>Infringe or violate copyrights, trademarks, trade secrets, or personal privacy.</li>
          <li>Interfere with, overload, or disrupt the operation of our servers or connected APIs.</li>
          <li>Attempt to reverse engineer, scrape without permission, or bypass security features.</li>
        </ul>
      </section>

      {/* Section 8: Availability and changes to the service */}
      <section id="availability" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          8. Availability and changes to the service
        </h2>
        <p className="text-muted-foreground">
          We work to keep {PRODUCT_NAME} fast and available, but we cannot guarantee uninterrupted or
          error-free operation.
        </p>
        <p className="text-muted-foreground">
          We may update features, modify AI models, release improvements, or suspend parts of the service
          for maintenance without prior liability.
        </p>
      </section>

      {/* Section 9: Ownership and permissions */}
      <section id="ownership" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          9. Ownership and permissions
        </h2>
        <p className="text-muted-foreground">
          You retain full ownership of the materials and ideas you provide, as well as the finished posts
          published to your profile.
        </p>
        <p className="text-muted-foreground">
          You grant {COMPANY_NAME} a limited, non-exclusive license to process, store, and transmit your
          onboarding preferences, topics, and draft feedback solely to operate, improve, and provide the
          service to you.
        </p>
      </section>

      {/* Section 10: Ending your account */}
      <section id="ending-account" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          10. Ending your account
        </h2>
        <p className="text-muted-foreground">
          You may stop using {PRODUCT_NAME} at any time and disconnect your LinkedIn and Slack accounts.
        </p>
        <p className="text-muted-foreground">
          To request permanent deletion of your account and stored drafts, send an email to {CONTACT_EMAIL}.
        </p>
        <p className="text-muted-foreground">
          We may suspend or terminate your access if you breach these terms or present a security hazard.
        </p>
      </section>

      {/* Section 11: Disclaimers */}
      <section id="disclaimers" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          11. Disclaimers
        </h2>
        <p className="text-muted-foreground">
          {PRODUCT_NAME} is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any
          kind, whether express, statutory, or implied.
        </p>
        <p className="text-muted-foreground">
          We disclaim all warranties of merchantability, fitness for a particular purpose, and non-infringement.
          We make no warranty that third-party APIs (including LinkedIn and Slack) will remain available without
          interruption.
        </p>
      </section>

      {/* Section 12: Limits on our liability */}
      <section id="liability-limits" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          12. Limits on our liability
        </h2>
        <p className="text-muted-foreground">
          To the maximum extent allowed by law, {COMPANY_NAME} and its operators are not liable for any
          indirect, incidental, special, or consequential damages resulting from your use of the service or
          any content published to LinkedIn.
        </p>
        <p className="text-muted-foreground">
          In no event shall the total aggregate liability of {COMPANY_NAME} arising out of or related to these
          terms or your use of {PRODUCT_NAME} exceed the total amount paid by you to {COMPANY_NAME} for the service
          in the twelve (12) months preceding the event giving rise to liability, or one hundred US dollars ($100 USD),
          whichever is greater.
        </p>
      </section>

      {/* Section 13: Governing law */}
      <section id="governing-law" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          13. Governing law
        </h2>
        <p className="text-muted-foreground">
          These Terms of Service and any dispute arising out of or relating to them or {PRODUCT_NAME} shall be
          governed by and construed in accordance with {GOVERNING_LAW}, without regard to conflict of law
          principles.
        </p>
        <p className="text-muted-foreground">
          Any legal action or proceeding arising under these terms shall be brought exclusively in the competent
          courts of Pakistan, and you consent to the personal jurisdiction and venue of such courts.
        </p>
      </section>

      {/* Section 14: Changes to these terms */}
      <section id="terms-changes" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          14. Changes to these terms
        </h2>
        <p className="text-muted-foreground">
          We may update these Terms of Service as our service evolves. When changes occur, we will update the
          &quot;Last updated&quot; date at the top of this page. Your continued use of {PRODUCT_NAME} after updates
          means you accept the revised terms.
        </p>
      </section>

      {/* Section 15: Contact */}
      <section id="contact" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          15. Contact
        </h2>
        <p className="text-muted-foreground">
          For questions or notices regarding these Terms of Service, contact {COMPANY_NAME} at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}
