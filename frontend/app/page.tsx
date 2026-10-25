import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { HeroExample } from "@/app/components/HeroExample";
import { FaqSection } from "@/app/components/FaqSection";
import { Footer } from "@/app/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { ClockIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";

export default function LandingPage() {
  const contactEmail = env.contactEmail;
  const companyName = env.companyName;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top navigation */}
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="page-container mx-auto px-4 md:px-6 pt-12 pb-16 md:pt-16 md:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Copy column (7 cols on lg) */}
            <div className="lg:col-span-7 text-left space-y-6">
              {/* Trust Badge */}
              <Badge variant="neutral" className="gap-2 px-3 py-1 text-xs">
                <span className="size-2 rounded-full bg-primary" />
                <span>AI-Assisted Engine · 100% Human Approval Gate</span>
              </Badge>

              {/* Display Headline */}
              <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-foreground text-balance">
                Daily LinkedIn posts. You approve each one.
              </h1>

              {/* Subtitle */}
              <p className="text-muted-foreground text-lg sm:text-xl max-w-xl leading-relaxed">
                AutoPulse finds what is trending in your field, writes the post, designs the branded image, and sends it to you to approve. Nothing goes live until you say so.
              </p>

              {/* CTAs */}
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

              {/* Key Trust Metrics */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-border max-w-md">
                <div>
                  <p className="text-2xl font-display font-semibold text-foreground">0</p>
                  <p className="text-caption text-muted-foreground">Unwanted auto-posts</p>
                </div>
                <div>
                  <p className="text-2xl font-display font-semibold text-foreground">5 min</p>
                  <p className="text-caption text-muted-foreground">Daily review queue</p>
                </div>
                <div>
                  <p className="text-2xl font-display font-semibold text-primary">100%</p>
                  <p className="text-caption text-muted-foreground">Human-in-the-loop</p>
                </div>
              </div>
            </div>

            {/* Interactive example card (5 cols on lg) */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <HeroExample />
            </div>
          </div>
        </section>

        {/* Section: What happens every day */}
        <section id="how-it-works" className="border-t border-border py-16 md:py-24 bg-background">
          <div className="page-container mx-auto px-4 md:px-6">
            <div className="max-w-2xl mb-12 text-left">
              <span className="text-xs font-semibold uppercase text-primary block mb-2">
                Automated Discovery · Human Verification
              </span>
              <h2 className="text-3xl md:text-4xl font-display font-semibold text-foreground mb-3">
                What happens every day
              </h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                Every weekday morning, AutoPulse runs a five-stage pipeline designed to protect your reputation while keeping your profile consistently active.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Step 1 */}
              <div className="p-5 rounded-lg bg-card border border-border text-left">
                <div className="size-8 rounded-md bg-signal-soft text-primary flex items-center justify-center text-xs font-bold font-mono mb-4">
                  01
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Find
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  Monitors industry discussions, RSS feeds, and data sources to discover high-relevance niche topics.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-lg bg-card border border-border text-left">
                <div className="size-8 rounded-md bg-signal-soft text-primary flex items-center justify-center text-xs font-bold font-mono mb-4">
                  02
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Write
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  Drafts an authoritative, concise post with a strong hook reflecting your professional perspective.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-lg bg-card border border-border text-left">
                <div className="size-8 rounded-md bg-signal-soft text-primary flex items-center justify-center text-xs font-bold font-mono mb-4">
                  03
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Design
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  Generates an editorial branded graphic card formatted to stand out in the crowded LinkedIn feed.
                </p>
              </div>

              {/* Step 4: Highlighted step */}
              <div className="p-5 rounded-lg bg-signal-soft border border-signal-line text-left">
                <div className="size-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold font-mono mb-4">
                  04
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <h3 className="text-base font-semibold text-foreground">
                    Approve
                  </h3>
                  <Badge variant="default" className="text-caption px-1.5 py-0 h-4">You</Badge>
                </div>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  You receive an alert to review. You can approve with one click, request edits, or reject entirely.
                </p>
              </div>

              {/* Step 5 */}
              <div className="p-5 rounded-lg bg-card border border-border text-left">
                <div className="size-8 rounded-md bg-signal-soft text-primary flex items-center justify-center text-xs font-bold font-mono mb-4">
                  05
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Publish
                </h3>
                <p className="text-caption text-muted-foreground leading-relaxed">
                  Only after your approval, the post and visual are published directly to your profile via LinkedIn API.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Core Guarantees */}
        <section id="workflow" className="border-t border-border py-16 md:py-24 bg-card">
          <div className="page-container mx-auto px-4 md:px-6">
            <div className="max-w-2xl mb-12 text-left">
              <span className="text-xs font-semibold uppercase text-primary block mb-2">
                Engineered For Trust
              </span>
              <h2 className="text-3xl md:text-4xl font-display font-semibold text-foreground mb-3">
                Why professionals choose AutoPulse
              </h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                Most AI marketing tools run on autopilot and create corporate embarrassments. AutoPulse was designed with the opposite philosophy.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div className="p-6 rounded-lg border border-border bg-background text-left space-y-3">
                <div className="size-10 rounded-md bg-card border border-border flex items-center justify-center text-primary">
                  <ShieldCheckIcon className="size-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  Zero automated mishaps
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  There is no auto-publish on schedule switch. If you do not tap approve, nothing ever gets posted. Your reputation stays in your hands at all times.
                </p>
              </div>

              {/* Card 2 */}
              <div className="p-6 rounded-lg border border-border bg-background text-left space-y-3">
                <div className="size-10 rounded-md bg-card border border-border flex items-center justify-center text-primary">
                  <ClockIcon className="size-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  5 minutes daily routine
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  No more staring at blank editors or spending hours brainstorming hooks. Open the app, read today&apos;s prepared draft, polish if needed, and confirm.
                </p>
              </div>

              {/* Card 3 */}
              <div className="p-6 rounded-lg border border-border bg-background text-left space-y-3">
                <div className="size-10 rounded-md bg-card border border-border flex items-center justify-center text-primary">
                  <SparklesIcon className="size-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  High-impact visual cards
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  LinkedIn algorithms heavily favor image and document posts. Every single draft includes a branded visual graphic crafted to stop the scroll.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Frequently Asked Questions */}
        <section id="faq" className="border-t border-border py-16 md:py-24 bg-background">
          <div className="max-w-2xl mx-auto px-4 md:px-6 text-left">
            <span className="text-xs font-semibold uppercase text-primary block mb-2">
              Common Questions
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-semibold text-foreground mb-4">
              Frequently asked questions
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mb-8 leading-relaxed">
              Everything you need to know about how AutoPulse connects, drafts, and handles your LinkedIn permissions.
            </p>

            <FaqSection contactEmail={contactEmail} />
          </div>
        </section>

        {/* Section: CTA Section */}
        <section className="border-t border-border py-16 md:py-20 bg-card">
          <div className="page-container mx-auto px-4 md:px-6">
            <div className="rounded-lg bg-foreground text-background p-8 md:p-12 text-left flex flex-col md:flex-row items-start md:items-center justify-between gap-8 border border-border">
              <div className="max-w-xl space-y-3">
                <span className="text-xs font-semibold uppercase text-signal-line font-mono">
                  Get Started Today
                </span>
                <h2 className="text-2xl md:text-3xl font-display font-semibold text-background">
                  Take control of your LinkedIn presence.
                </h2>
                <p className="text-sm md:text-base text-background/80 leading-relaxed">
                  Join professionals who post consistently without agency retainers or automated risks. Your first draft will be ready tomorrow morning.
                </p>
              </div>
              <div className="shrink-0">
                <Link href="/auth/sign-up">
                  <Button variant="default" size="lg">
                    Create your free account
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
