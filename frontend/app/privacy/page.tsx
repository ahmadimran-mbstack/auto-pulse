// Public Privacy Policy page for AutoPulse
// Explains what personal information we collect, how it is used, and third-party services in use
import React from "react";
import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/legal/LegalShell";
import {
  LEGAL_CONFIG,
  COMPANY_NAME,
  PRODUCT_NAME,
  CONTACT_EMAIL,
} from "@/lib/legal-config";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// Page metadata for search engines and social cards
export const metadata: Metadata = {
  title: `Privacy Policy | ${PRODUCT_NAME}`,
  description:
    "Learn what data AutoPulse collects, how AI post drafting works, and how your LinkedIn and Slack connections are handled.",
  robots: {
    index: true,
    follow: true,
  },
};

// Section headers for the sticky table of contents
const SECTIONS: LegalSection[] = [
  { id: "who-we-are", title: "1. Who we are" },
  { id: "what-we-collect", title: "2. What we collect" },
  { id: "how-we-use-it", title: "3. How we use it" },
  { id: "how-ai-is-used", title: "4. How AI is used" },
  { id: "data-sharing", title: "5. Who we share data with" },
  { id: "linkedin-and-slack", title: "6. LinkedIn and Slack" },
  { id: "cookies", title: "7. Cookies" },
  { id: "data-retention", title: "8. How long we keep data" },
  { id: "your-choices", title: "9. Your choices" },
  { id: "security", title: "10. Security" },
  { id: "age-limit", title: "11. Age limit" },
  { id: "policy-changes", title: "12. Changes to this policy" },
  { id: "contact", title: "13. Contact" },
];

// Main component rendering the complete Privacy Policy document
export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" sections={SECTIONS}>
      {/* Section 1: Who we are */}
      <section id="who-we-are" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          1. Who we are
        </h2>
        <p className="text-muted-foreground">
          This Privacy Policy explains how {COMPANY_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
          handles information when you use {PRODUCT_NAME}.
        </p>
        <p className="text-muted-foreground">
          {PRODUCT_NAME} is an automated LinkedIn drafting and publishing tool. It helps you research topics,
          draft posts with AI assistance, send drafts for human review, and publish approved posts to LinkedIn.
        </p>
        <p className="text-muted-foreground">
          If you have questions about this policy, reach us at {CONTACT_EMAIL}.
        </p>
      </section>

      {/* Section 2: What we collect */}
      <section id="what-we-collect" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          2. What we collect
        </h2>
        <p className="text-muted-foreground">
          We collect only the information needed to run the service:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>
            <strong className="text-foreground font-medium">Account data:</strong> Your name and email
            address when you sign up or log in through Neon Auth.
          </li>
          <li>
            <strong className="text-foreground font-medium">Onboarding details:</strong> Your professional role,
            industry, niche description, target audience, tone preferences, and topics you choose during setup.
          </li>
          <li>
            <strong className="text-foreground font-medium">Connected accounts:</strong> Authorization tokens
            and account identifiers for your connected LinkedIn account and Slack workspace.
          </li>
          <li>
            <strong className="text-foreground font-medium">Content and product data:</strong> Generated post
            drafts, your approval and rejection decisions, published post history, AI-writing quality scores,
            and post performance analytics.
          </li>
          <li>
            <strong className="text-foreground font-medium">Technical data:</strong> Essential session
            cookies, IP addresses, and request headers sent by your web browser to deliver pages securely.
          </li>
        </ul>
      </section>

      {/* Section 3: How we use it */}
      <section id="how-we-use-it" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          3. How we use it
        </h2>
        <p className="text-muted-foreground">
          We use your information exclusively to provide and operate {PRODUCT_NAME}:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>To search for recent industry topics and news relevant to your professional focus.</li>
          <li>To write proposed LinkedIn post drafts that match your requested role and tone.</li>
          <li>To send drafts to you for review through an email link or a Slack message.</li>
          <li>To publish posts to your connected LinkedIn profile only after you explicitly approve them.</li>
          <li>To compute AI-writing quality scores and display post analytics in your dashboard.</li>
          <li>To authenticate your identity, prevent unauthorized access, and manage your account.</li>
        </ul>
      </section>

      {/* Section 4: How AI is used */}
      <section id="how-ai-is-used" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          4. How AI is used
        </h2>
        <p className="text-muted-foreground">
          {PRODUCT_NAME} uses AI models to assist with topic selection, post drafting, and style checks.
        </p>
        <p className="text-muted-foreground">
          When we generate a draft, we send the AI provider your chosen topics, niche description, role,
          tone preferences, and short web search summaries of relevant news articles.
        </p>
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground">
          <strong>TODO:</strong> Confirm whether the AI model provider retains or trains on customer
          prompts and drafts under their commercial API terms.
        </div>
      </section>

      {/* Section 5: Who we share data with */}
      <section id="data-sharing" className="scroll-mt-24 space-y-4">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          5. Who we share data with
        </h2>
        <p className="text-muted-foreground">
          We share data only with the service providers required to host, build, and deliver {PRODUCT_NAME}:
        </p>

        {/* Table summarizing third-party services and data exchanged */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4 text-foreground font-medium">Service</TableHead>
                <TableHead className="w-1/3 text-foreground font-medium">Purpose</TableHead>
                <TableHead className="text-foreground font-medium">Data received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-foreground">Neon</TableCell>
                <TableCell className="text-muted-foreground">Database hosting and user sign-in authentication</TableCell>
                <TableCell className="text-muted-foreground">Name, email, account preferences, drafts, and encrypted tokens</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Vercel</TableCell>
                <TableCell className="text-muted-foreground">Frontend web application hosting</TableCell>
                <TableCell className="text-muted-foreground">Web traffic requests and session cookies</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Railway</TableCell>
                <TableCell className="text-muted-foreground">Backend API server and background Slack listener</TableCell>
                <TableCell className="text-muted-foreground">API requests, draft generation jobs, and approval workflows</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Redis</TableCell>
                <TableCell className="text-muted-foreground">Temporary caching for application performance</TableCell>
                <TableCell className="text-muted-foreground">Temporary query results and cached session data</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">LinkedIn API</TableCell>
                <TableCell className="text-muted-foreground">Social media profile connection and post publishing</TableCell>
                <TableCell className="text-muted-foreground">OAuth authorization tokens and approved post content</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Slack</TableCell>
                <TableCell className="text-muted-foreground">Draft approval alerts and interactive action buttons</TableCell>
                <TableCell className="text-muted-foreground">Post draft previews and workspace channel identifiers</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Email sending provider</TableCell>
                <TableCell className="text-muted-foreground">Delivering one-click approval links and account notices</TableCell>
                <TableCell className="text-muted-foreground">Recipient email address, name, and approval URLs</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">AI model provider</TableCell>
                <TableCell className="text-muted-foreground">Drafting post text and scoring post quality</TableCell>
                <TableCell className="text-muted-foreground">Topic keywords, niche details, style settings, and research summaries</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Web search provider (Exa or Tavily)</TableCell>
                <TableCell className="text-muted-foreground">Searching recent public web news for topic ideas</TableCell>
                <TableCell className="text-muted-foreground">Industry search keywords and topic queries</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Section 6: LinkedIn and Slack */}
      <section id="linkedin-and-slack" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          6. LinkedIn and Slack
        </h2>
        <p className="text-muted-foreground">
          {PRODUCT_NAME} integrates with LinkedIn and Slack to deliver drafts and publish approved posts:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>
            <strong className="text-foreground font-medium">What we access:</strong> For LinkedIn, we
            request authorization to publish approved posts to your profile. For Slack, we request permission
            to send draft preview messages and approval buttons.
          </li>
          <li>
            <strong className="text-foreground font-medium">Token storage:</strong> OAuth tokens are kept on
            our server. LinkedIn tokens are encrypted at rest in our database using Fernet symmetric encryption.
          </li>
          <li>
            <strong className="text-foreground font-medium">Token expiration:</strong> LinkedIn access
            tokens expire after 60 days and cannot be refreshed automatically. When a token expires, you must
            reconnect your LinkedIn account to continue publishing.
          </li>
          <li>
            <strong className="text-foreground font-medium">Strict human approval:</strong> Nothing is ever
            posted to LinkedIn automatically. A post is published only after you explicitly click approve.
          </li>
          <li>
            <strong className="text-foreground font-medium">How to disconnect:</strong> You can disconnect
            LinkedIn or Slack at any time from the Connections page in your dashboard, or by revoking access
            directly in your LinkedIn or Slack security settings.
          </li>
        </ul>
      </section>

      {/* Section 7: Cookies */}
      <section id="cookies" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          7. Cookies
        </h2>
        <p className="text-muted-foreground">
          We use only essential cookies required for authentication and security through Neon Auth. These
          cookies keep you signed in while you use the application.
        </p>
        <p className="text-muted-foreground">
          We do not use third-party advertising cookies or cross-site marketing trackers.
        </p>
      </section>

      {/* Section 8: How long we keep data */}
      <section id="data-retention" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          8. How long we keep data
        </h2>
        <p className="text-muted-foreground">
          We retain your account details, post drafts, and history while your account remains active.
        </p>
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground">
          <strong>TODO:</strong> Confirm formal data retention periods and deletion schedules.
        </div>
      </section>

      {/* Section 9: Your choices */}
      <section id="your-choices" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          9. Your choices
        </h2>
        <p className="text-muted-foreground">
          You have direct control over your connections and content in {PRODUCT_NAME}:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>You can disconnect LinkedIn or Slack at any time in your account settings.</li>
          <li>You can edit your onboarding answers, topic choices, voice rules, and schedule in settings.</li>
          <li>You can reject, edit, or approve any post draft before anything is published.</li>
          <li>
            For account deletion, data export, or other privacy requests, email us at {CONTACT_EMAIL}.
          </li>
        </ul>
      </section>

      {/* Section 10: Security */}
      <section id="security" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          10. Security
        </h2>
        <p className="text-muted-foreground">
          We protect your information using practical technical safeguards:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>LinkedIn OAuth tokens are encrypted at rest in our database using Fernet symmetric encryption.</li>
          <li>Database connections require TLS encryption with certificate verification.</li>
          <li>Web traffic between your browser and our servers is encrypted using HTTPS.</li>
          <li>User sign in, session tokens, and passwords are managed through Neon Auth.</li>
        </ul>
      </section>

      {/* Section 11: Age limit */}
      <section id="age-limit" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          11. Age limit
        </h2>
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground">
          <strong>TODO:</strong> Confirm minimum age requirement ({LEGAL_CONFIG.MIN_AGE}).
        </div>
      </section>

      {/* Section 12: Changes to this policy */}
      <section id="policy-changes" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          12. Changes to this policy
        </h2>
        <p className="text-muted-foreground">
          We may update this Privacy Policy to reflect changes in our product or legal duties. When we make
          changes, we will update the &quot;Last updated&quot; date at the top of this page.
        </p>
      </section>

      {/* Section 13: Contact */}
      <section id="contact" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl sm:text-2xl font-normal tracking-[-0.02em] text-foreground">
          13. Contact
        </h2>
        <p className="text-muted-foreground">
          For questions about this Privacy Policy or your personal information, contact {COMPANY_NAME} at{" "}
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
