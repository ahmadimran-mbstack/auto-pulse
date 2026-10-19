import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { Footer } from "@/app/components/Footer";
import { env } from "@/lib/env";

export const metadata = {
  title: "Terms of Service - AutoPulse",
  description: "Read the terms governing the use of the AutoPulse platform.",
};

export default function TermsPage() {
  const companyName = env.companyName;
  const contactEmail = env.contactEmail;
  const siteUrl = env.siteUrl;

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      <Navbar />

      <main className="flex-1 max-w-[840px] w-full mx-auto px-6 py-12 text-left">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs text-muted">
          <Link href="/" className="hover:text-ink transition-colors">Home</Link>
          <span>/</span>
          <span className="text-ink font-medium">Terms of Service</span>
        </div>

        {/* Content Card */}
        <div className="p-8 sm:p-12 rounded-[16px] border border-line bg-surface card-subtle-shadow space-y-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-geist font-normal tracking-tighter text-ink mb-2">
              Terms of Service
            </h1>
            <p className="text-xs text-muted font-mono">Effective date: October 2026</p>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-ink max-prose-copy border-t border-line pt-8">
            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Agreement to terms</h2>
              <p className="text-muted">
                By accessing or using AutoPulse at {siteUrl}, operated by {companyName} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use the service.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Description of service</h2>
              <p className="text-muted">
                AutoPulse is a content assistant tool for LinkedIn. The service scans for trending topics in your professional field, generates suggested post copy and accompanying graphics, and presents drafts for your review. AutoPulse will not publish any post to your LinkedIn profile without your explicit approval.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Accounts and authentication</h2>
              <p className="text-muted">
                You must provide accurate account information (name and email) when signing up. User authentication is managed securely through Neon Auth. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">LinkedIn connection and permissions</h2>
              <p className="text-muted">
                To publish approved posts, you must authorize AutoPulse through LinkedIn OAuth. You grant AutoPulse permission to post approved content to your designated profile. You retain full ownership of your content and may revoke LinkedIn account permissions at any time through LinkedIn settings or by deleting your account.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">User content and approval</h2>
              <p className="text-muted">
                You are solely responsible for reviewing all draft text and imagery before approving publication. We do not guarantee the factual accuracy, completeness, or performance of any AI-assisted draft. Once you click Approve, the post is published in accordance with your explicit directive.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Data use and deletion</h2>
              <p className="text-muted">
                We do not sell your personal data or post drafts. To request account termination and permanent deletion of your stored drafts and tokens, email{" "}
                <a href={`mailto:${contactEmail}`} className="text-signal underline hover:text-signal-hover">
                  {contactEmail}
                </a>
                .
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Contact</h2>
              <p className="text-muted">
                For questions regarding these terms, contact {companyName} at{" "}
                <a href={`mailto:${contactEmail}`} className="text-signal underline hover:text-signal-hover">
                  {contactEmail}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer contactEmail={contactEmail} companyName={companyName} />
    </div>
  );
}
