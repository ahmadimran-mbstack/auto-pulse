"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPost, fetchPostImageBlob, ApiClientError } from "@/lib/api";
import { getStatusChipConfig, formatRunDate } from "@/lib/posts";
import type { PostDetail } from "@/types/posts";

interface PostDetailClientProps {
  id: string;
}

// Extracts clean hostname from URL without leading www
function extractHostname(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

export function PostDetailClient({ id }: PostDetailClientProps) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [is404, setIs404] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blob image state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Fetch post details and post image concurrently for fast loading
  useEffect(() => {
    let isMounted = true;
    let activeUrl: string | null = null;

    async function loadData() {
      setLoading(true);
      setError(null);
      setIs404(false);
      setImageLoading(true);
      setImageError(false);

      // Start fetching the image in parallel
      const imagePromise = fetchPostImageBlob(id)
        .then((blob) => {
          if (!isMounted) return;
          activeUrl = URL.createObjectURL(blob);
          setImageUrl(activeUrl);
        })
        .catch(() => {
          if (!isMounted) return;
          setImageError(true);
        })
        .finally(() => {
          if (isMounted) setImageLoading(false);
        });

      try {
        const fetched = await getPost(id);
        if (!isMounted) return;
        setPost(fetched);
      } catch (err: unknown) {
        if (!isMounted) return;
        if (err instanceof ApiClientError && err.status === 404) {
          setIs404(true);
        } else {
          const msg = err instanceof Error ? err.message : "Could not load post.";
          setError(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }

      await imagePromise;
    }

    loadData();

    return () => {
      isMounted = false;
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [id]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-8 animate-pulse text-left py-6">
        <div className="h-4 w-32 bg-line rounded" />
        <div className="h-8 w-96 bg-line rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 max-w-[560px] w-full space-y-4">
            <div className="h-6 w-24 bg-line rounded-full" />
            <div className="aspect-square w-full bg-line rounded-[12px]" />
            <div className="h-28 bg-line rounded-[12px]" />
          </div>
          <div className="lg:col-span-5 w-full space-y-4">
            <div className="h-48 bg-line rounded-[12px]" />
          </div>
        </div>
      </div>
    );
  }

  // 404 Not Found state
  if (is404) {
    return (
      <div className="py-16 text-left space-y-4 max-w-[560px]">
        <h1 className="text-2xl font-geist font-normal text-ink">
          We can&apos;t find that post.
        </h1>
        <p className="text-sm text-muted">
          This draft might have been removed or belongs to another workspace.
        </p>
        <div>
          <Link
            href="/app"
            prefetch={true}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-signal hover:underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Generic error state
  if (error || !post) {
    return (
      <div className="py-12 text-left space-y-4 max-w-[560px]">
        <h1 className="text-xl font-geist font-normal text-rejected-text">
          Something went wrong
        </h1>
        <p className="text-sm text-muted">{error || "Unable to display this draft."}</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3.5 py-1.5 rounded-[6px] bg-surface text-ink border border-line text-xs font-medium hover:bg-paper cursor-pointer"
          >
            Try again
          </button>
          <Link href="/app" prefetch={true} className="text-xs text-signal hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const chip = getStatusChipConfig(post.status);

  return (
    <div className="space-y-8 text-left py-4">
      {/* Back link to dashboard */}
      <div>
        <Link
          href="/app"
          prefetch={true}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors cursor-pointer group"
        >
          <svg
            className="w-3.5 h-3.5 text-muted group-hover:text-ink transition-colors"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back to dashboard</span>
        </Link>
      </div>

      {/* Main Single Page Heading */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-geist font-normal tracking-tight text-ink">
          {post.topic_title}
        </h1>
        <p className="text-xs text-muted mt-1">
          Draft prepared for {formatRunDate(post.run_date)}
        </p>
      </div>

      {/* Two column presentation: Left media and caption, Right source intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column (max 560px) */}
        <div className="lg:col-span-7 max-w-[560px] w-full space-y-6">
          {/* Status chip */}
          <div>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${chip.className}`}
            >
              {chip.hasCheckIcon && (
                <svg
                  className="w-3 h-3 text-ink shrink-0"
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
              )}
              {chip.label}
            </span>
          </div>

          {/* Branded image container with fixed square placeholder */}
          <div className="relative aspect-square w-full bg-paper border border-line rounded-[12px] overflow-hidden flex items-center justify-center">
            {imageLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted animate-pulse bg-paper">
                <svg
                  className="w-8 h-8 text-line"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="text-xs">Loading image...</span>
              </div>
            )}

            {imageUrl && !imageLoading && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl}
                alt="Image for this post"
                className="w-full h-full object-cover"
              />
            )}

            {imageError && !imageLoading && (
              <div className="p-4 text-center text-xs text-muted">
                Image preview unavailable right now.
              </div>
            )}
          </div>

          {/* Post caption keeping exact line breaks */}
          <div className="p-6 rounded-[12px] bg-surface border border-line text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans">
            {post.caption}
          </div>

          {/* Hashtags list */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              {post.hashtags.map((tag, idx) => (
                <span key={idx} className="hover:text-ink transition-colors">
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right Column (or stacked on mobile) */}
        <div className="lg:col-span-5 w-full space-y-6">
          <div className="p-6 rounded-[12px] bg-surface border border-line space-y-5">
            <h2 className="text-xs font-mono font-medium text-muted uppercase tracking-wider">
              Based on
            </h2>

            <div>
              <a
                href={post.topic_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-semibold text-ink hover:text-signal transition-colors inline-flex items-start gap-1.5 group"
              >
                <span>{post.topic_title}</span>
                <svg
                  className="w-4 h-4 text-muted group-hover:text-signal shrink-0 mt-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>

            {post.sources && post.sources.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-line">
                <h3 className="text-xs font-medium text-muted uppercase tracking-wider">
                  Sources
                </h3>
                <ul className="space-y-3">
                  {post.sources.map((source, index) => {
                    const host = extractHostname(source.url);
                    const formattedDate = source.published_at
                      ? formatRunDate(source.published_at)
                      : null;

                    return (
                      <li key={index} className="text-xs space-y-1">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink font-medium hover:text-signal transition-colors hover:underline line-clamp-2 block"
                        >
                          {source.title}
                        </a>
                        <div className="text-muted flex items-center gap-2">
                          <span>{host}</span>
                          {formattedDate && (
                            <>
                              <span>·</span>
                              <span>{formattedDate}</span>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Passive bottom note without action buttons */}
      <div className="pt-8 border-t border-line text-xs text-muted">
        Approval comes next.
      </div>
    </div>
  );
}
