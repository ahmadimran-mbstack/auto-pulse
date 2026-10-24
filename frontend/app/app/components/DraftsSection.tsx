"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPosts, getPostSchedule, generateDraft } from "@/lib/api";
import { getStatusChipConfig, formatRunDate, formatNextDraftTime } from "@/lib/posts";
import type { PostListItem, PostSchedule } from "@/types/posts";

interface DraftsSectionProps {
  timezone?: string | null;
  initialPosts?: PostListItem[] | null;
  initialSchedule?: PostSchedule | null;
}

export function DraftsSection({
  timezone,
  initialPosts,
  initialSchedule,
}: DraftsSectionProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<PostListItem[] | null>(initialPosts ?? null);
  const [schedule, setSchedule] = useState<PostSchedule | null>(initialSchedule ?? null);
  const [loading, setLoading] = useState(
    initialPosts === undefined && initialSchedule === undefined
  );
  const [error, setError] = useState<string | null>(null);

  // Development draft generation state
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Loads drafts and upcoming schedule on mount
  useEffect(() => {
    // If preloaded in parallel by parent, use the initial data
    if (initialPosts !== undefined && initialSchedule !== undefined) {
      setPosts(initialPosts);
      setSchedule(initialSchedule);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadData() {
      try {
        const [postsRes, scheduleRes] = await Promise.allSettled([
          getPosts(5),
          getPostSchedule(),
        ]);
        if (!isMounted) return;

        if (postsRes.status === "fulfilled") {
          setPosts(postsRes.value.items);
        }
        if (scheduleRes.status === "fulfilled") {
          setSchedule(scheduleRes.value);
        }

        if (postsRes.status === "rejected") {
          const err = postsRes.reason;
          const msg = err instanceof Error ? err.message : "Failed to load drafts.";
          setError(msg);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load drafts.";
        setError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [initialPosts, initialSchedule]);

  // User-initiated reload on error
  async function handleRetry() {
    setLoading(true);
    setError(null);
    try {
      const [postsRes, scheduleRes] = await Promise.allSettled([
        getPosts(5),
        getPostSchedule(),
      ]);

      if (postsRes.status === "fulfilled") {
        setPosts(postsRes.value.items);
      }
      if (scheduleRes.status === "fulfilled") {
        setSchedule(scheduleRes.value);
      }

      if (postsRes.status === "rejected") {
        const err = postsRes.reason;
        const msg = err instanceof Error ? err.message : "Failed to load drafts.";
        setError(msg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load drafts.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Triggers dev-only draft generation and redirects on success
  async function handleGenerateNow() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const newPost = await generateDraft(true);
      router.prefetch(`/app/posts/${newPost.id}`);
      router.push(`/app/posts/${newPost.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not generate draft.";
      setGenerateError(msg);
      setGenerating(false);
    }
  }

  // Format the upcoming draft time
  const formattedNextDraft = formatNextDraftTime(schedule?.next_draft_at, timezone);

  return (
    <section className="space-y-6" aria-labelledby="drafts-section-title">
      <div className="border-b border-line pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 id="drafts-section-title" className="text-xl font-geist font-normal tracking-tight text-ink">
            Your drafts
          </h2>
          <p className="text-muted text-xs mt-1">
            Review and view daily post drafts created for your niche.
          </p>
        </div>

        {/* Development draft generation trigger */}
        {process.env.NODE_ENV !== "production" && (
          <div className="flex flex-col items-start sm:items-end gap-1">
            <button
              type="button"
              onClick={handleGenerateNow}
              disabled={generating}
              className="px-3 py-1.5 rounded-[6px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-2"
            >
              {generating && (
                <svg className="w-3.5 h-3.5 animate-spin text-surface" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {generating ? "Generating draft..." : "Generate a draft now"}
            </button>
            <span className="text-[11px] text-muted">
              Development only. This can take up to a minute.
            </span>
          </div>
        )}
      </div>

      {/* Generation error display */}
      {generateError && (
        <div role="alert" className="p-3.5 rounded-[8px] bg-rejected-bg border border-[#F5C2B9] text-xs text-rejected-text">
          <p className="font-medium">{generateError}</p>
        </div>
      )}

      {/* Calm generation in-progress state banner */}
      {generating && (
        <div className="p-4 rounded-[8px] bg-signal-soft/60 border border-signal-border/50 text-xs text-signal flex items-center gap-3 animate-pulse">
          <svg className="w-4 h-4 animate-spin text-signal shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span>Creating your draft and branded image. This can take up to a minute.</span>
        </div>
      )}

      {/* Loading state skeleton */}
      {loading && (
        <div className="divide-y divide-line border-y border-line animate-pulse">
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-16 bg-line rounded-full" />
              <div className="h-4 w-64 bg-line rounded" />
            </div>
            <div className="h-4 w-20 bg-line rounded" />
          </div>
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-24 bg-line rounded-full" />
              <div className="h-4 w-80 bg-line rounded" />
            </div>
            <div className="h-4 w-20 bg-line rounded" />
          </div>
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-20 bg-line rounded-full" />
              <div className="h-4 w-52 bg-line rounded" />
            </div>
            <div className="h-4 w-20 bg-line rounded" />
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="p-6 rounded-[8px] bg-paper border border-line text-left space-y-3">
          <p className="text-sm text-rejected-text font-medium">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3.5 py-1.5 rounded-[6px] bg-surface text-ink border border-line text-xs font-medium hover:bg-paper cursor-pointer transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && posts && posts.length === 0 && (
        <div className="py-8 px-4 rounded-[8px] bg-paper border border-line text-center text-sm text-muted">
          {formattedNextDraft ? (
            <p>
              No drafts yet. Your next draft is due <span className="font-medium text-ink">{formattedNextDraft}</span>.
            </p>
          ) : (
            <p>Finish setup to get your first draft.</p>
          )}
        </div>
      )}

      {/* Posts list separated by 1px lines */}
      {!loading && !error && posts && posts.length > 0 && (
        <div className="divide-y divide-line border-y border-line">
          {posts.map((post) => {
            const chip = getStatusChipConfig(post.status);
            return (
              <Link
                key={post.id}
                href={`/app/posts/${post.id}`}
                prefetch={true}
                className="py-4 px-2 -mx-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-paper transition-colors rounded-[6px] group"
              >
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 min-w-0">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${chip.className}`}
                  >
                    {chip.hasCheckIcon && (
                      <svg className="w-3 h-3 text-ink shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path
                          d="M3 8.5L6.5 12L13 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {chip.label}
                  </span>
                  <span className="text-sm font-medium text-ink group-hover:text-signal transition-colors truncate">
                    {post.topic_title}
                  </span>
                </div>
                <div className="text-xs text-muted shrink-0 sm:text-right">
                  {formatRunDate(post.run_date)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
