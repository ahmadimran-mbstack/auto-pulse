import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { HeroExample } from "@/app/components/HeroExample";
import { FaqSection } from "@/app/components/FaqSection";
import { Footer } from "@/app/components/Footer";
import { env } from "@/lib/env";

export default function LandingPage() {
  const contactEmail = env.contactEmail;
  const companyName = env.companyName;

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      {/* Top navigation */}
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-[1160px] mx-auto px-6 pt-14 pb-20 md:pt-20 md:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Copy column (7 cols on lg) */}
            <div className="lg:col-span-7 text-left space-y-6">
              {/* Trust Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-line text-xs font-medium text-ink shadow-xs">
                <span className="w-2 h-2 rounded-full bg-signal animate-pulse-glow" />
                <span>AI-Assisted Engine · 100% Human Approval Gate</span>
              </div>

              {/* Display Headline */}
              <h1 className="font-display-h1 font-geist font-normal tracking-tighter text-ink text-balance">
                Daily LinkedIn posts. You approve each one.
              </h1>

              {/* Subtitle */}
              <p className="text-muted text-lg sm:text-xl max-prose-copy leading-relaxed">
                AutoPulse finds what is trending in your field, writes the post, designs the branded image, and sends it to you to approve. Nothing goes live until you say so.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href="/auth/sign-up"
                  className="px-6 py-3.5 bg-signal text-surface rounded-[8px] text-base font-medium hover:bg-signal-hover transition-all shadow-sm active:translate-y-[1px] cursor-pointer"
                >
                  Create your account
                </Link>
                <a
                  href="#how-it-works"
                  className="px-5 py-3.5 text-base font-medium text-muted hover:text-ink border border-line rounded-[8px] bg-surface hover:bg-paper transition-all cursor-pointer"
                >
                  See how it works
                </a>
              </div>

              {/* Key Trust Metrics */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-line/80 max-w-[500px]">
                <div>
                  <p className="text-2xl font-geist font-normal tracking-tighter text-ink">0</p>
                  <p className="text-xs text-muted leading-tight">Unwanted auto-posts</p>
                </div>
                <div>
                  <p className="text-2xl font-geist font-normal tracking-tighter text-ink">5 min</p>
                  <p className="text-xs text-muted leading-tight">Daily review queue</p>
                </div>
                <div>
                  <p className="text-2xl font-geist font-normal tracking-tighter text-signal">100%</p>
                  <p className="text-xs text-muted leading-tight">Human-in-the-loop</p>
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
        <section id="how-it-works" className="border-t border-line py-20 md:py-28 bg-paper">
          <div className="max-w-[1160px] mx-auto px-6">
            <div className="max-w-[640px] mb-14 text-left">
              <span className="text-xs font-semibold uppercase tracking-wider text-signal block mb-2">
                Automated Discovery · Human Verification
              </span>
              <h2 className="text-3xl md:text-4xl font-geist font-normal tracking-tighter text-ink mb-3">
                What happens every day
              </h2>
              <p className="text-sm md:text-base text-muted leading-relaxed">
                Every weekday morning, AutoPulse runs a five-stage pipeline designed to protect your reputation while keeping your profile consistently active.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {/* Step 1 */}
              <div className="p-5 rounded-[12px] bg-surface border border-line text-left card-hover-lift">
                <div className="w-8 h-8 rounded-[6px] bg-signal-soft text-signal flex items-center justify-center text-xs font-bold font-mono mb-4">
                  01
                </div>
                <h3 className="text-base font-geist font-normal tracking-tighter text-ink mb-2">
                  Find
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Monitors industry discussions, RSS feeds, and data sources to discover high-relevance niche topics.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-[12px] bg-surface border border-line text-left card-hover-lift">
                <div className="w-8 h-8 rounded-[6px] bg-signal-soft text-signal flex items-center justify-center text-xs font-bold font-mono mb-4">
                  02
                </div>
                <h3 className="text-base font-geist font-normal tracking-tighter text-ink mb-2">
                  Write
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Drafts an authoritative, concise post with a strong hook reflecting your professional perspective.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-[12px] bg-surface border border-line text-left card-hover-lift">
                <div className="w-8 h-8 rounded-[6px] bg-signal-soft text-signal flex items-center justify-center text-xs font-bold font-mono mb-4">
                  03
                </div>
                <h3 className="text-base font-geist font-normal tracking-tighter text-ink mb-2">
                  Design
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Generates an editorial branded graphic card formatted to stand out in the crowded LinkedIn feed.
                </p>
              </div>

              {/* Step 4: Highlighted step */}
              <div className="p-5 rounded-[12px] bg-signal-soft/40 border border-signal/40 text-left card-hover-lift ring-1 ring-signal/20">
                <div className="w-8 h-8 rounded-[6px] bg-signal text-surface flex items-center justify-center text-xs font-bold font-mono mb-4">
                  04
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  <h3 className="text-base font-geist font-normal tracking-tighter text-ink">
                    Approve
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-signal text-white font-medium">You</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  You receive an alert to review. You can approve with one click, request edits, or reject entirely.
                </p>
              </div>

              {/* Step 5 */}
              <div className="p-5 rounded-[12px] bg-surface border border-line text-left card-hover-lift">
                <div className="w-8 h-8 rounded-[6px] bg-signal-soft text-signal flex items-center justify-center text-xs font-bold font-mono mb-4">
                  05
                </div>
                <h3 className="text-base font-geist font-normal tracking-tighter text-ink mb-2">
                  Publish
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Only after your approval, the post and visual are published directly to your profile via LinkedIn API.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Bento Grid - Core Guarantees */}
        <section id="workflow" className="border-t border-line py-20 md:py-28 bg-surface">
          <div className="max-w-[1160px] mx-auto px-6">
            <div className="max-w-[640px] mb-14 text-left">
              <span className="text-xs font-semibold uppercase tracking-wider text-signal block mb-2">
                Engineered For Trust
              </span>
              <h2 className="text-3xl md:text-4xl font-geist font-normal tracking-tighter text-ink mb-3">
                Why professionals choose AutoPulse
              </h2>
              <p className="text-sm md:text-base text-muted leading-relaxed">
                Most AI marketing tools run on autopilot and create corporate embarrassments. AutoPulse was designed with the opposite philosophy.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div className="p-7 rounded-[14px] border border-line bg-paper text-left space-y-3 card-hover-lift">
                <div className="w-10 h-10 rounded-[8px] bg-surface border border-line flex items-center justify-center text-signal">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-xl font-geist font-normal tracking-tighter text-ink">
                  Zero automated mishaps
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  There is no &ldquo;auto-publish on schedule&rdquo; switch. If you do not tap approve, nothing ever gets posted. Your reputation stays in your hands at all times.
                </p>
              </div>

              {/* Card 2 */}
              <div className="p-7 rounded-[14px] border border-line bg-paper text-left space-y-3 card-hover-lift">
                <div className="w-10 h-10 rounded-[8px] bg-surface border border-line flex items-center justify-center text-signal">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-geist font-normal tracking-tighter text-ink">
                  5 minutes daily routine
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  No more staring at blank editors or spending hours brainstorming hooks. Open the app, read today&apos;s prepared draft, polish if needed, and confirm.
                </p>
              </div>

              {/* Card 3 */}
              <div className="p-7 rounded-[14px] border border-line bg-paper text-left space-y-3 card-hover-lift">
                <div className="w-10 h-10 rounded-[8px] bg-surface border border-line flex items-center justify-center text-signal">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-geist font-normal tracking-tighter text-ink">
                  High-impact visual cards
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  LinkedIn algorithms heavily favor image and document posts. Every single draft includes a branded visual graphic crafted to stop the scroll.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Frequently Asked Questions */}
        <section id="faq" className="border-t border-line py-20 md:py-28 bg-paper">
          <div className="max-w-[760px] mx-auto px-6 text-left">
            <span className="text-xs font-semibold uppercase tracking-wider text-signal block mb-2">
              Common Questions
            </span>
            <h2 className="text-3xl md:text-4xl font-geist font-normal tracking-tighter text-ink mb-4">
              Frequently asked questions
            </h2>
            <p className="text-sm md:text-base text-muted mb-10 leading-relaxed">
              Everything you need to know about how AutoPulse connects, drafts, and handles your LinkedIn permissions.
            </p>

            <FaqSection contactEmail={contactEmail} />
          </div>
        </section>

        {/* Section: Climax CTA Card */}
        <section className="border-t border-line py-16 md:py-24 bg-surface">
          <div className="max-w-[1160px] mx-auto px-6">
            <div className="rounded-[16px] bg-ink text-surface p-8 md:p-14 text-left flex flex-col md:flex-row items-start md:items-center justify-between gap-8 hero-panel-shadow relative overflow-hidden">
              <div className="max-w-[560px] space-y-3 z-10">
                <span className="text-xs font-semibold uppercase tracking-wider text-signal-soft font-mono">
                  Get Started Today
                </span>
                <h2 className="text-2xl md:text-4xl font-geist font-normal tracking-tighter text-surface">
                  Take control of your LinkedIn presence.
                </h2>
                <p className="text-sm md:text-base text-surface/75 leading-relaxed">
                  Join professionals who post consistently without agency retainers or automated risks. Your first draft will be ready tomorrow morning.
                </p>
              </div>
              <div className="z-10 shrink-0">
                <Link
                  href="/auth/sign-up"
                  className="inline-block px-7 py-3.5 bg-signal text-surface rounded-[8px] text-base font-medium hover:bg-signal-hover transition-colors shadow-sm cursor-pointer"
                >
                  Create your free account
                </Link>
              </div>

              {/* Decorative background shape */}
              <div className="absolute right-0 top-0 bottom-0 w-96 bg-linear-to-l from-signal/20 to-transparent pointer-events-none" />
            </div>
          </div>
        </section>
      </main>

      {/* Global Footer */}
      <Footer contactEmail={contactEmail} companyName={companyName} />
    </div>
  );
}
