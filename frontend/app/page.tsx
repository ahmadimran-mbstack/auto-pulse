import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { HeroExample } from "@/app/components/HeroExample";
import { FaqSection } from "@/app/components/FaqSection";
import { Footer } from "@/app/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Bell,
  CheckCircle2,
  Key,
  Lock,
  Newspaper,
  ShieldCheck,
  Trash2,
} from "lucide-react";

export default function LandingPage() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@autopulse.ai";
  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || "AutoPulse Inc.";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* 1. Navigation */}
      <Navbar />

      <main className="flex-1">
        {/* 2. Hero Section */}
        <section className="page-container mx-auto px-4 md:px-6 pt-12 pb-16 md:pt-16 md:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Copy column */}
            <div className="lg:col-span-7 text-left space-y-6">
              <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-foreground text-balance">
                Daily LinkedIn posts. You approve each one.
              </h1>

              <p className="text-muted-foreground text-lg sm:text-xl max-w-xl leading-relaxed">
                AutoPulse finds what is trending in your field, writes the post, designs the image, and sends it to you to approve. Nothing goes live until you say so.
              </p>

              {/* Call to action buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link href="/auth/sign-up">
                  <Button variant="default" size="lg">
                    Create your account
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button variant="outline" size="lg">
                    See how it works
                  </Button>
                </a>
              </div>
            </div>

            {/* Interactive example card */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <HeroExample />
            </div>
          </div>
        </section>

        {/* 3. How It Works Section */}
        <section id="how-it-works" className="border-t border-border py-16 md:py-24 bg-card">
          <div className="page-container mx-auto px-4 md:px-6 text-left">
            <div className="max-w-2xl mb-12">
              <h2 className="text-2xl sm:text-3xl font-display font-semibold text-foreground mb-2">
                How it works
              </h2>
              <p className="text-body text-muted-foreground">
                Three simple steps keep your profile active every day without risking your voice.
              </p>
            </div>

            {/* Three numbered steps */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <Card className="p-6 bg-background border-border text-left flex flex-col justify-between">
                <div>
                  <div
                    className="size-7 rounded-md bg-secondary text-foreground flex items-center justify-center text-meta font-bold font-mono mb-4"
                    aria-hidden="true"
                  >
                    1
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-2">
                    Tell us your niche and voice
                  </h3>
                  <p className="text-caption text-muted-foreground leading-relaxed mb-6">
                    Pick the topics and perspectives you want to share. Set how analytical, direct, or conversational your drafts should sound.
                  </p>
                </div>

                {/* UI Mock: Topic tags and tone choices */}
                <div
                  className="p-4 rounded-md border border-border bg-card space-y-3"
                  role="region"
                  aria-label="Example topics and tone settings"
                >
                  <div>
                    <span className="text-caption text-muted-foreground block mb-1.5 font-medium">
                      Topics
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="neutral">#ProductManagement</Badge>
                      <Badge variant="neutral">#AIWorkflows</Badge>
                      <Badge variant="neutral">#Engineering</Badge>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <span className="text-caption text-muted-foreground block mb-1.5 font-medium">
                      Tone
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="approved">Analytical</Badge>
                      <Badge variant="neutral">Direct</Badge>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Step 2 */}
              <Card className="p-6 bg-background border-border text-left flex flex-col justify-between">
                <div>
                  <div
                    className="size-7 rounded-md bg-secondary text-foreground flex items-center justify-center text-meta font-bold font-mono mb-4"
                    aria-hidden="true"
                  >
                    2
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-2">
                    Approve each draft
                  </h3>
                  <p className="text-caption text-muted-foreground leading-relaxed mb-6">
                    Every morning, review today&apos;s proposed text and graphic. Approve, edit, or reject the post with one click.
                  </p>
                </div>

                {/* UI Mock: Approval page card */}
                <div
                  className="p-4 rounded-md border border-border bg-card space-y-3"
                  role="region"
                  aria-label="Example draft approval interface"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-caption font-medium text-foreground">
                      Morning draft
                    </span>
                    <Badge variant="draft">Pending review</Badge>
                  </div>
                  <p className="text-caption text-muted-foreground line-clamp-2">
                    Measure completed customer workflows instead of feature volume to identify retention bottlenecks.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="h-7 text-caption flex-1" disabled>
                      Approve
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-caption flex-1" disabled>
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Step 3 */}
              <Card className="p-6 bg-background border-border text-left flex flex-col justify-between">
                <div>
                  <div
                    className="size-7 rounded-md bg-secondary text-foreground flex items-center justify-center text-meta font-bold font-mono mb-4"
                    aria-hidden="true"
                  >
                    3
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-2">
                    We publish at your time
                  </h3>
                  <p className="text-caption text-muted-foreground leading-relaxed mb-6">
                    Once you approve, AutoPulse publishes to LinkedIn at your scheduled time through the official API.
                  </p>
                </div>

                {/* UI Mock: Published status row */}
                <div
                  className="p-4 rounded-md border border-border bg-card space-y-2"
                  role="region"
                  aria-label="Example published status row"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-muted-foreground">Scheduled time</span>
                    <span className="text-caption font-mono font-medium text-foreground tabular-nums">
                      08:30 AM
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-caption font-medium text-foreground truncate pr-2">
                      Customer retention metrics
                    </span>
                    <Badge variant="published" className="shrink-0">
                      Published
                    </Badge>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* 4. Three Feature Rows */}
        <section className="py-16 md:py-24 border-t border-border bg-background">
          <div className="page-container mx-auto px-4 md:px-6 space-y-16 md:space-y-24">
            {/* Feature Row 1: Posts built on fresh news */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
              <div className="text-left space-y-3">
                <h3 className="text-2xl font-display font-semibold text-foreground">
                  Posts built on fresh news
                </h3>
                <p className="text-body text-muted-foreground leading-relaxed">
                  AutoPulse scans recent articles and trends in your niche so your posts are timely and relevant.
                </p>
              </div>

              {/* UI Mock: List of sources with titles and dates */}
              <Card className="p-5 bg-card border-border text-left space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Newspaper className="size-4 text-primary" aria-hidden="true" />
                    <span className="text-caption font-semibold text-foreground">
                      Scanned niche sources
                    </span>
                  </div>
                  <Badge variant="neutral" className="text-caption font-mono uppercase">
                    Example
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-md bg-secondary/50 border border-border">
                    <div className="flex items-center justify-between text-caption text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">TechCrunch</span>
                      <span className="tabular-nums">2 hours ago</span>
                    </div>
                    <p className="text-caption text-foreground font-medium">
                      Open source models demonstrate higher efficiency on domain benchmarks
                    </p>
                  </div>

                  <div className="p-3 rounded-md bg-secondary/50 border border-border">
                    <div className="flex items-center justify-between text-caption text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">VentureBeat</span>
                      <span className="tabular-nums">4 hours ago</span>
                    </div>
                    <p className="text-caption text-foreground font-medium">
                      Enterprise teams shift priority from generic chatbots to custom workflows
                    </p>
                  </div>

                  <div className="p-3 rounded-md bg-secondary/50 border border-border">
                    <div className="flex items-center justify-between text-caption text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">Reuters</span>
                      <span className="tabular-nums">Yesterday</span>
                    </div>
                    <p className="text-caption text-foreground font-medium">
                      Cloud infrastructure providers report record demand for dedicated compute
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Feature Row 2: Your voice and your brand */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
              <div className="text-left space-y-3 md:order-2">
                <h3 className="text-2xl font-display font-semibold text-foreground">
                  Your voice and your brand
                </h3>
                <p className="text-body text-muted-foreground leading-relaxed">
                  Every post includes an editorial graphic styled in your selected brand colors and layout.
                </p>
              </div>

              {/* UI Mock: CSS mock of the branded image in two colors */}
              <div
                className="w-full rounded-lg bg-primary p-6 text-primary-foreground flex flex-col justify-between md:order-1"
                role="img"
                aria-label="Branded graphic card in two colors: The fastest way to improve retention is to eliminate steps between onboarding and the first completed outcome"
              >
                <div className="flex items-center justify-between pb-4 border-b border-primary-foreground/20 mb-6">
                  <span className="text-caption font-semibold tracking-wider text-signal-line uppercase font-mono">
                    AutoPulse Graphic
                  </span>
                  <span className="text-caption opacity-80 tabular-nums">08:00 AM</span>
                </div>

                <div className="my-4 space-y-2">
                  <p className="text-lg font-semibold leading-snug text-primary-foreground">
                    &ldquo;The fastest way to improve retention is to eliminate steps between onboarding and the first completed outcome.&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-primary-foreground/20 text-caption opacity-80">
                  <span className="font-medium">Alex Morgan</span>
                  <span>autopulse.ai</span>
                </div>
              </div>
            </div>

            {/* Feature Row 3: You decide every post */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
              <div className="text-left space-y-3">
                <h3 className="text-2xl font-display font-semibold text-foreground">
                  You decide every post
                </h3>
                <p className="text-body text-muted-foreground leading-relaxed">
                  No draft is published until you approve it. Discard, request changes, or approve on your schedule.
                </p>
              </div>

              {/* UI Mock: Four status badges with one plain line each */}
              <Card className="p-5 bg-card border-border text-left space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <span className="text-caption font-semibold text-foreground">
                    Draft statuses
                  </span>
                  <span className="text-caption text-muted-foreground">
                    Strict approval standard
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-md bg-secondary/50 border border-border flex items-center justify-between gap-4">
                    <Badge variant="draft">Draft</Badge>
                    <span className="text-caption text-muted-foreground text-right">
                      Prepared each morning from fresh topics
                    </span>
                  </div>

                  <div className="p-3 rounded-md bg-secondary/50 border border-border flex items-center justify-between gap-4">
                    <Badge variant="approved">Approved</Badge>
                    <span className="text-caption text-muted-foreground text-right">
                      Confirmed by you and queued for dispatch
                    </span>
                  </div>

                  <div className="p-3 rounded-md bg-secondary/50 border border-border flex items-center justify-between gap-4">
                    <Badge variant="published">Published</Badge>
                    <span className="text-caption text-muted-foreground text-right">
                      Live on your LinkedIn profile via official API
                    </span>
                  </div>

                  <div className="p-3 rounded-md bg-secondary/50 border border-border flex items-center justify-between gap-4">
                    <Badge variant="danger">Rejected</Badge>
                    <span className="text-caption text-muted-foreground text-right">
                      Discarded and never published anywhere
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* 5. Trust Grid Section */}
        <section className="py-16 md:py-24 border-t border-border bg-card">
          <div className="page-container mx-auto px-4 md:px-6 text-left">
            <div className="max-w-2xl mb-12">
              <h2 className="text-2xl sm:text-3xl font-display font-semibold text-foreground mb-2">
                Built for trust
              </h2>
              <p className="text-body text-muted-foreground">
                Clear boundaries and direct controls so you always stay in control of your account.
              </p>
            </div>

            {/* Six short trust items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="p-5 bg-background border-border text-left space-y-2">
                <div className="size-8 rounded-md bg-secondary text-primary flex items-center justify-center">
                  <CheckCircle2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3 className="text-meta font-semibold text-foreground">
                  You approve every post
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  No draft ever goes live automatically.
                </p>
              </Card>

              <Card className="p-5 bg-background border-border text-left space-y-2">
                <div className="size-8 rounded-md bg-secondary text-primary flex items-center justify-center">
                  <Key className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3 className="text-meta font-semibold text-foreground">
                  Uses LinkedIn&apos;s official API
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  Direct OAuth connection with official permissions.
                </p>
              </Card>

              <Card className="p-5 bg-background border-border text-left space-y-2">
                <div className="size-8 rounded-md bg-secondary text-primary flex items-center justify-center">
                  <Lock className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3 className="text-meta font-semibold text-foreground">
                  Connection tokens are encrypted
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  Stored securely and never exposed in the browser.
                </p>
              </Card>

              <Card className="p-5 bg-background border-border text-left space-y-2">
                <div className="size-8 rounded-md bg-secondary text-primary flex items-center justify-center">
                  <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3 className="text-meta font-semibold text-foreground">
                  Delete your account and data yourself
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  One click in settings removes your information.
                </p>
              </Card>

              <Card className="p-5 bg-background border-border text-left space-y-2">
                <div className="size-8 rounded-md bg-secondary text-primary flex items-center justify-center">
                  <Bell className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3 className="text-meta font-semibold text-foreground">
                  Reminders before your LinkedIn connection expires
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  Alerts when your 60-day token needs renewal.
                </p>
              </Card>

              <Card className="p-5 bg-background border-border text-left space-y-2">
                <div className="size-8 rounded-md bg-secondary text-primary flex items-center justify-center">
                  <ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3 className="text-meta font-semibold text-foreground">
                  No scraping and no engagement automation
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  No fake comments, bots, or browser emulation.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* 6. Frequently Asked Questions Section */}
        <section id="faq" className="py-16 md:py-24 border-t border-border bg-background">
          <div className="page-container mx-auto px-4 md:px-6 text-left">
            <div className="max-w-2xl mb-10">
              <h2 className="text-2xl sm:text-3xl font-display font-semibold text-foreground mb-2">
                Frequently asked questions
              </h2>
              <p className="text-body text-muted-foreground">
                Clear answers about how AutoPulse works, connects, and protects your account.
              </p>
            </div>

            <div className="max-w-3xl">
              <FaqSection contactEmail={contactEmail} />
            </div>
          </div>
        </section>

        {/* 7. Closing Band */}
        <section className="py-16 md:py-20 border-t border-border bg-card">
          <div className="page-container mx-auto px-4 md:px-6">
            <div className="p-8 md:p-12 rounded-lg bg-foreground text-background border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-left">
              <div className="space-y-2 max-w-xl">
                <h2 className="text-2xl sm:text-3xl font-display font-semibold text-background">
                  Start with LinkedIn.
                </h2>
                <p className="text-body text-background/80">
                  Create your account, set your niche, and review your first draft tomorrow morning.
                </p>
              </div>
              <div className="shrink-0">
                <Link href="/auth/sign-up">
                  <Button variant="default" size="lg">
                    Create your account
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Global Footer */}
      <Footer contactEmail={contactEmail} companyName={companyName} />
    </div>
  );
}
