import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { Footer } from "@/app/components/Footer";
import { Card } from "@/components/ui/card";
import { env } from "@/lib/env";

export const metadata = {
  title: "Privacy Policy | AutoPulse",
  description: "Learn how AutoPulse collects, uses, and manages your personal data.",
};

export default function PrivacyPage() {
  const companyName = env.companyName;
  const contactEmail = env.contactEmail;
  const siteUrl = env.siteUrl;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 form-container w-full mx-auto px-6 py-12 text-left">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-caption text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Privacy Policy</span>
        </div>

        {/* Content Card */}
        <Card className="p-8 sm:p-12 space-y-8">
          <div>
            <h1 className="text-title font-display text-foreground mb-2">
              Privacy Policy
            </h1>
            <p className="text-caption text-muted-foreground font-mono">Effective date: October 2026</p>
          </div>

          <div className="space-y-8 text-body text-foreground border-t border-border pt-8">
            <section className="space-y-2">
              <h2 className="text-h3 font-display text-foreground">Introduction</h2>
              <p className="text-muted-foreground">
                This Privacy Policy explains how {companyName} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects, handles, and protects information when you use AutoPulse at {siteUrl}. We keep this document simple, plain, and strictly true to what the application performs.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-h3 font-display text-foreground">Information we collect</h2>
              <p className="text-muted-foreground">
                When you create an account and connect your profile, we collect only the minimum information necessary to operate the service:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground pt-1">
                <li>
                  <strong className="text-foreground">Account details:</strong> Your name and email address provided during registration.
                </li>
                <li>
                  <strong className="text-foreground">Authentication data:</strong> Account creation and sign-in credentials are processed and verified securely by Neon Auth.
                </li>
                <li>
                  <strong className="text-foreground">LinkedIn connection permissions:</strong> When you connect your profile, we store authorization tokens granted through LinkedIn OAuth so the system can submit approved content on your behalf.
                </li>
                <li>
                  <strong className="text-foreground">Content drafts and post history:</strong> Suggested post texts, generated graphics, approval statuses, and records of published posts.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-h3 font-display text-foreground">How we use your information</h2>
              <p className="text-muted-foreground">
                We use your information exclusively to operate AutoPulse:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground pt-1">
                <li>To find relevant trending topics in your professional domain.</li>
                <li>To draft proposed LinkedIn posts and accompanying graphics for your review.</li>
                <li>To display your review queue and publish posts only when you explicitly approve them.</li>
                <li>To maintain account security and communicate service updates.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-h3 font-display text-foreground">We do not sell your data</h2>
              <p className="text-muted-foreground">
                We do not sell, rent, or trade your personal information or content drafts to third parties or advertising networks.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-h3 font-display text-foreground">Data retention and deletion</h2>
              <p className="text-muted-foreground">
                You have the right to request full deletion of your account and associated data at any time. To request deletion, send an email to{" "}
                <a href={`mailto:${contactEmail}`} className="text-primary underline hover:text-primary">
                  {contactEmail}
                </a>
                . Upon receiving your verified request, we will remove your account, profile connection tokens, and stored drafts from our database.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-h3 font-display text-foreground">Contact us</h2>
              <p className="text-muted-foreground">
                If you have any questions about this Privacy Policy, please contact {companyName} at{" "}
                <a href={`mailto:${contactEmail}`} className="text-primary underline hover:text-primary">
                  {contactEmail}
                </a>
                .
              </p>
            </section>
          </div>
        </Card>
      </main>

      <Footer contactEmail={contactEmail} companyName={companyName} />
    </div>
  );
}
