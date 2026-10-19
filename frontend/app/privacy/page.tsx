import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { Footer } from "@/app/components/Footer";
import { env } from "@/lib/env";

export const metadata = {
  title: "Privacy Policy - AutoPulse",
  description: "Learn how AutoPulse collects, uses, and manages your personal data.",
};

export default function PrivacyPage() {
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
          <span className="text-ink font-medium">Privacy Policy</span>
        </div>

        {/* Content Card */}
        <div className="p-8 sm:p-12 rounded-[16px] border border-line bg-surface card-subtle-shadow space-y-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-geist font-normal tracking-tighter text-ink mb-2">
              Privacy Policy
            </h1>
            <p className="text-xs text-muted font-mono">Effective date: October 2026</p>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-ink max-prose-copy border-t border-line pt-8">
            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Introduction</h2>
              <p className="text-muted">
                This Privacy Policy explains how {companyName} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects, handles, and protects information when you use AutoPulse at {siteUrl}. We keep this document simple, plain, and strictly true to what the application performs.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Information we collect</h2>
              <p className="text-muted">
                When you create an account and connect your profile, we collect only the minimum information necessary to operate the service:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted pt-1">
                <li>
                  <strong className="text-ink">Account details:</strong> Your name and email address provided during registration.
                </li>
                <li>
                  <strong className="text-ink">Authentication data:</strong> Account creation and sign-in credentials are processed and verified securely by Neon Auth.
                </li>
                <li>
                  <strong className="text-ink">LinkedIn connection permissions:</strong> When you connect your profile, we store authorization tokens granted through LinkedIn OAuth so the system can submit approved content on your behalf.
                </li>
                <li>
                  <strong className="text-ink">Content drafts and post history:</strong> Suggested post texts, generated graphics, approval statuses, and records of published posts.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">How we use your information</h2>
              <p className="text-muted">
                We use your information exclusively to operate AutoPulse:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-muted pt-1">
                <li>To find relevant trending topics in your professional domain.</li>
                <li>To draft proposed LinkedIn posts and accompanying graphics for your review.</li>
                <li>To display your review queue and publish posts only when you explicitly approve them.</li>
                <li>To maintain account security and communicate service updates.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">We do not sell your data</h2>
              <p className="text-muted">
                We do not sell, rent, or trade your personal information or content drafts to third parties or advertising networks.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Data retention and deletion</h2>
              <p className="text-muted">
                You have the right to request full deletion of your account and associated data at any time. To request deletion, send an email to{" "}
                <a href={`mailto:${contactEmail}`} className="text-signal underline hover:text-signal-hover">
                  {contactEmail}
                </a>
                . Upon receiving your verified request, we will remove your account, profile connection tokens, and stored drafts from our database.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-geist font-normal tracking-tighter text-ink">Contact us</h2>
              <p className="text-muted">
                If you have any questions about this Privacy Policy, please contact {companyName} at{" "}
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
