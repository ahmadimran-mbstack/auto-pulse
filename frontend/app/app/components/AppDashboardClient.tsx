"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProfile, getConnections, getPosts, getPostSchedule } from "@/lib/api";
import type { Profile } from "@/types/profile";
import type { SocialConnection } from "@/types/connections";
import type { PostListItem, PostSchedule } from "@/types/posts";
import { ApiCheckPanel } from "./ApiCheckPanel";
import { AccountLinkingPanel } from "./AccountLinkingPanel";
import { BrandPreviewCard } from "./BrandPreviewCard";
import { LinkedInConnectionRow } from "./LinkedInConnectionRow";
import { formatSchedule } from "@/lib/schedule-format";
import { DraftsSection } from "./DraftsSection";

interface AppDashboardClientProps {
  user: {
    name?: string | null;
    email: string;
  };
  apiUrl: string;
}

export function AppDashboardClient({ user, apiUrl }: AppDashboardClientProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialConnection, setInitialConnection] = useState<SocialConnection | null>(null);
  const [initialPosts, setInitialPosts] = useState<PostListItem[] | null>(null);
  const [initialSchedule, setInitialSchedule] = useState<PostSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Check for successful LinkedIn connection flash message on arrival
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("connected") === "linkedin") {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        // Defer notice state update to the next event loop tick
        const showTimer = setTimeout(() => {
          setSuccessNotice("LinkedIn account connected successfully.");
        }, 0);
        const hideTimer = setTimeout(() => {
          setSuccessNotice(null);
        }, 5000);
        return () => {
          clearTimeout(showTimer);
          clearTimeout(hideTimer);
        };
      }
    }
  }, []);

  // Load all overview page data concurrently with Promise.all
  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        const [profileRes, connectionsRes, postsRes, scheduleRes] = await Promise.all([
          getProfile(),
          getConnections().catch((err) => {
            console.warn("Failed to load connections:", err);
            return [] as SocialConnection[];
          }),
          getPosts(5).catch((err) => {
            console.warn("Failed to load posts:", err);
            return { items: [] as PostListItem[], next_cursor: null };
          }),
          getPostSchedule().catch((err) => {
            console.warn("Failed to load schedule:", err);
            return { next_draft_at: null, next_post_at: null } as PostSchedule;
          }),
        ]);

        if (!isMounted) return;

        // If onboarding is incomplete, redirect to resume onboarding flow
        if (!profileRes.onboarding_complete) {
          router.replace("/app/onboarding");
          return;
        }

        const linkedin = connectionsRes.find((c) => c.provider === "linkedin") || null;

        setProfile(profileRes);
        setInitialConnection(linkedin);
        setInitialPosts(postsRes.items);
        setInitialSchedule(scheduleRes);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load profile";
        setError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Calm skeleton while verifying onboarding status
  if (loading) {
    return (
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10 space-y-8 animate-pulse text-left">
        <div className="space-y-3">
          <div className="h-4 bg-line rounded-md w-32" />
          <div className="h-9 bg-line rounded-md w-72" />
          <div className="h-4 bg-line rounded-md w-96" />
        </div>
        <div className="space-y-6 pt-6">
          <div className="h-40 bg-surface rounded-[12px] border border-line" />
          <div className="h-40 bg-surface rounded-[12px] border border-line" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10 text-left">
        <div className="p-6 rounded-[12px] bg-rejected-bg border border-[#F5C2B9] text-sm text-rejected-text space-y-3">
          <h2 className="text-base font-semibold">Unable to connect to backend</h2>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-[6px] bg-surface text-ink border border-line font-medium hover:bg-paper cursor-pointer"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  // Fallback while redirecting if incomplete
  if (!profile || !profile.onboarding_complete) {
    return null;
  }

  const displayName = profile.display_name || user.name || user.email;
  const schedulePhrase = formatSchedule(profile.post_time, profile.post_days, profile.timezone);

  return (
    <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10 text-left space-y-10">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-geist font-normal tracking-tighter text-ink mb-2">
          Welcome, {displayName}
        </h1>
        <p className="text-muted text-sm max-prose-copy">
          Your publishing setup is configured and active.
        </p>
      </div>

      {/* Success Notification announced to screen readers and auto-fading */}
      {successNotice && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-[10px] bg-signal-soft border border-[#93D7CE] text-signal font-medium text-sm flex items-center justify-between animate-fade-in"
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="w-4 h-4 text-signal shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 8.5L6.5 12L13 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-xs text-muted hover:text-ink cursor-pointer p-1"
            aria-label="Dismiss notice"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* LinkedIn Connection Status Row */}
      <LinkedInConnectionRow initialConnection={initialConnection} />

      {/* Your Setup Section */}
      <div className="space-y-6">
        <div className="border-b border-line pb-3">
          <h2 className="text-xl font-geist font-normal tracking-tight text-ink">
            Your setup
          </h2>
        </div>

        {/* Four compact summaries separated by 1px lines, spacing, and distinct layouts */}
        <div className="divide-y divide-line border-y border-line">
          {/* Summary 1: Focus */}
          <div className="py-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            <div className="space-y-1">
              <span className="text-xs font-mono font-medium text-signal uppercase tracking-wider">
                Step 1
              </span>
              <h3 className="text-base font-semibold text-ink">Focus</h3>
              <Link
                href="/app/onboarding/1"
                className="inline-block text-xs font-medium text-signal hover:underline pt-1 cursor-pointer"
              >
                Edit focus
              </Link>
            </div>

            <div className="md:col-span-3 space-y-3.5 text-sm">
              {(profile.role_title || profile.industry) && (
                <p className="font-medium text-ink">
                  {[profile.role_title, profile.industry].filter(Boolean).join(" · ")}
                </p>
              )}

              {profile.niche_description && (
                <p className="text-muted leading-relaxed">
                  {profile.niche_description}
                </p>
              )}

              {profile.audience && (
                <div className="text-xs text-muted">
                  <span className="font-medium text-ink">Target Audience:</span> {profile.audience}
                </div>
              )}

              {/* Topics chips */}
              <div className="space-y-2 pt-1">
                {profile.topics_include && profile.topics_include.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-ink mr-1">Topics:</span>
                    {profile.topics_include.map((topic, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-[4px] bg-signal-soft/40 border border-signal/20 text-xs text-signal font-medium"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                {profile.topics_avoid && profile.topics_avoid.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted mr-1">Avoid:</span>
                    {profile.topics_avoid.map((topic, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-[4px] bg-paper border border-line text-xs text-muted"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary 2: Voice */}
          <div className="py-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            <div className="space-y-1">
              <span className="text-xs font-mono font-medium text-signal uppercase tracking-wider">
                Step 2
              </span>
              <h3 className="text-base font-semibold text-ink">Voice</h3>
              <Link
                href="/app/onboarding/2"
                className="inline-block text-xs font-medium text-signal hover:underline pt-1 cursor-pointer"
              >
                Edit voice
              </Link>
            </div>

            <div className="md:col-span-3 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-ink">Tone:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-signal text-surface text-xs font-medium capitalize shadow-2xs">
                  {profile.tone || "Professional"}
                </span>
              </div>

              {profile.voice_notes ? (
                <div className="text-xs text-muted leading-relaxed">
                  <span className="font-medium text-ink">Notes:</span> {profile.voice_notes}
                </div>
              ) : (
                <p className="text-xs text-muted">No custom voice notes provided.</p>
              )}

              {profile.sample_posts ? (
                <div className="text-xs text-muted leading-relaxed">
                  <span className="font-medium text-ink">Sample Posts:</span> Provided
                </div>
              ) : null}
            </div>
          </div>

          {/* Summary 3: Brand */}
          <div className="py-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            <div className="space-y-1">
              <span className="text-xs font-mono font-medium text-signal uppercase tracking-wider">
                Step 3
              </span>
              <h3 className="text-base font-semibold text-ink">Brand</h3>
              <Link
                href="/app/onboarding/3"
                className="inline-block text-xs font-medium text-signal hover:underline pt-1 cursor-pointer"
              >
                Edit brand
              </Link>
            </div>

            <div className="md:col-span-3 flex flex-col sm:flex-row items-start gap-6">
              <BrandPreviewCard
                brandName={profile.brand_name || "Your Brand"}
                primaryHex={profile.brand_primary_hex || "#0B7F70"}
                accentHex={profile.brand_accent_hex || "#14B8A6"}
                showWarning={false}
              />

              <div className="space-y-2 text-xs text-muted">
                <p>
                  <span className="font-medium text-ink">Name:</span> {profile.brand_name || "Not set"}
                </p>
                <p className="flex items-center gap-2">
                  <span className="font-medium text-ink">Primary:</span>
                  <span
                    className="w-3 h-3 rounded-full border border-line"
                    style={{ backgroundColor: profile.brand_primary_hex || "#0B7F70" }}
                  />
                  <span className="font-mono uppercase">{profile.brand_primary_hex || "#0B7F70"}</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="font-medium text-ink">Accent:</span>
                  <span
                    className="w-3 h-3 rounded-full border border-line"
                    style={{ backgroundColor: profile.brand_accent_hex || "#14B8A6" }}
                  />
                  <span className="font-mono uppercase">{profile.brand_accent_hex || "#14B8A6"}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Summary 4: Schedule */}
          <div className="py-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            <div className="space-y-1">
              <span className="text-xs font-mono font-medium text-signal uppercase tracking-wider">
                Step 4
              </span>
              <h3 className="text-base font-semibold text-ink">Schedule</h3>
              <Link
                href="/app/onboarding/4"
                className="inline-block text-xs font-medium text-signal hover:underline pt-1 cursor-pointer"
              >
                Edit schedule
              </Link>
            </div>

            <div className="md:col-span-3 space-y-2 text-sm">
              <p className="font-medium text-ink text-base">
                {schedulePhrase}
              </p>
              <p className="text-xs text-muted">
                Approval method: Email notifications for each daily draft.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Your drafts Section */}
      <DraftsSection
        timezone={profile.timezone}
        initialPosts={initialPosts}
        initialSchedule={initialSchedule}
      />

      {/* Development-only API Check Panel */}
      {process.env.NODE_ENV !== "production" && (
        <div className="pt-8 border-t border-line">
          <div className="text-xs font-mono text-muted mb-4 uppercase tracking-wider">
            Development API Diagnostics
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="space-y-6">
              <Suspense fallback={<div className="p-5 rounded-xl border border-line bg-surface animate-pulse h-48" />}>
                <AccountLinkingPanel userEmail={user.email} />
              </Suspense>
            </div>
            <div className="space-y-6">
              <ApiCheckPanel apiUrl={apiUrl} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
