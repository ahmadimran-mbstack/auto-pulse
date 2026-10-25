"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { getPosts, getPostSchedule, generateDraft } from "@/lib/api";
import { formatRunDate, formatNextDraftTime } from "@/lib/posts";
import type { PostListItem, PostSchedule } from "@/types/posts";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Section } from "@/components/app/Section";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";

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

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [prevPosts, setPrevPosts] = useState(initialPosts);
  const [prevSchedule, setPrevSchedule] = useState(initialSchedule);

  if (initialPosts !== prevPosts || initialSchedule !== prevSchedule) {
    setPrevPosts(initialPosts);
    setPrevSchedule(initialSchedule);
    if (initialPosts !== undefined) setPosts(initialPosts);
    if (initialSchedule !== undefined) setSchedule(initialSchedule);
    if (initialPosts !== undefined && initialSchedule !== undefined) setLoading(false);
  }

  useEffect(() => {
    if (initialPosts !== undefined && initialSchedule !== undefined) {
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

  const formattedNextDraft = formatNextDraftTime(schedule?.next_draft_at, timezone);

  return (
    <Section
      title="Your drafts"
      description="Review and view daily post drafts created for your niche."
      actions={
        process.env.NODE_ENV !== "production" ? (
          <div className="flex flex-col items-start sm:items-end gap-1">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleGenerateNow}
              disabled={generating}
              className="gap-2"
            >
              {generating ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-3.5" />
              )}
              <span>{generating ? "Generating draft..." : "Generate a draft now"}</span>
            </Button>
            <span className="text-caption text-muted-foreground">
              Development only
            </span>
          </div>
        ) : undefined
      }
    >
      {/* Generation error display */}
      {generateError && (
        <div role="alert" className="p-3.5 rounded-md bg-status-danger-bg border border-destructive/20 text-xs text-status-danger-fg mb-4">
          <p className="font-medium">{generateError}</p>
        </div>
      )}

      {/* Generation in-progress banner */}
      {generating && (
        <div className="p-4 rounded-md bg-signal-soft border border-signal-line text-xs text-primary flex items-center gap-3 mb-4">
          <Loader2Icon className="size-4 animate-spin text-primary shrink-0" />
          <span>Creating your draft and branded image. This can take up to a minute.</span>
        </div>
      )}

      {/* Loading state skeleton */}
      {loading && (
        <div className="divide-y divide-border border-y border-border">
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-4 w-80" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <ErrorState message={error} onRetry={handleRetry} />
      )}

      {/* Empty state */}
      {!loading && !error && posts && posts.length === 0 && (
        <EmptyState
          message={
            formattedNextDraft
              ? `No drafts yet. Your next draft is due ${formattedNextDraft}.`
              : "Finish setup to get your first draft."
          }
          action={
            process.env.NODE_ENV !== "production" ? (
              <Button size="sm" variant="outline" onClick={handleGenerateNow}>
                Generate a draft now
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Posts list */}
      {!loading && !error && posts && posts.length > 0 && (
        <div className="divide-y divide-border border-y border-border">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/app/posts/${post.id}`}
              prefetch={true}
              className="py-4 px-2 -mx-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/50 transition-colors rounded-md group"
            >
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 min-w-0">
                <StatusBadge status={post.status} />
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {post.topic_title}
                </span>
              </div>
              <div className="text-xs text-muted-foreground shrink-0 sm:text-right font-mono">
                {formatRunDate(post.run_date)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
