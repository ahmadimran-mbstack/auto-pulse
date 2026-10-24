"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getPost,
  fetchPostImageBlob,
  submitPostDecision,
  retryPostPublication,
  ApiClientError,
} from "@/lib/api";
import {
  getStatusChipConfig,
  formatRunDate,
  formatDecisionDeadline,
  getPublicationErrorInfo,
} from "@/lib/posts";
import { PostPreview } from "@/app/components/PostPreview";
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

  // Action states for decisions and retries
  const [decisionSubmitting, setDecisionSubmitting] = useState<"approved" | "rejected" | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [confirmedNotPosted, setConfirmedNotPosted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [retrySubmitting, setRetrySubmitting] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Reloads full post record from backend
  const reloadPost = useCallback(async () => {
    try {
      const fetched = await getPost(id);
      setPost(fetched);
    } catch (err) {
      console.error("Failed to reload post:", err);
    }
  }, [id]);

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

  // Poll post data every 10 seconds while status is "publishing"
  useEffect(() => {
    if (post?.status !== "publishing") return;

    const intervalId = setInterval(() => {
      reloadPost();
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [post?.status, reloadPost]);

  // Handles approving or rejecting draft from dashboard
  async function handleDecision(decision: "approved" | "rejected") {
    setDecisionSubmitting(decision);
    setDecisionError(null);
    try {
      await submitPostDecision(id, decision);
      await reloadPost();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save decision.";
      setDecisionError(msg);
    } finally {
      setDecisionSubmitting(null);
    }
  }

  // Handles simple retry without confirmation (e.g. rate limit or step failure)
  async function handleSimpleRetry() {
    setRetrySubmitting(true);
    setRetryError(null);
    try {
      await retryPostPublication(id, false);
      await reloadPost();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to retry publication.";
      setRetryError(msg);
    } finally {
      setRetrySubmitting(false);
    }
  }

  // Executes confirmed retry for outcome_unknown
  async function executeConfirmedRetry() {
    setRetrySubmitting(true);
    setRetryError(null);
    try {
      await retryPostPublication(id, true);
      setShowConfirmModal(false);
      setConfirmedNotPosted(false);
      await reloadPost();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to retry publication.";
      setRetryError(msg);
    } finally {
      setRetrySubmitting(false);
    }
  }

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
  const linkedInPublication = post.publications?.find((p) => p.platform === "linkedin") || post.publications?.[0];
  const pubErrorInfo = getPublicationErrorInfo(linkedInPublication?.error_code);
  const formattedPublishAt = formatDecisionDeadline(post.publish_at);
  const formattedDeadline = formatDecisionDeadline(post.publish_at || post.approval?.expires_at);

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

          {/* Status Action Block positioned above caption */}
          {post.status === "awaiting_approval" && (
            <div className="p-4 rounded-[10px] bg-surface border border-line space-y-3">
              <div className="text-xs text-muted">
                {formattedDeadline ? `Decide before ${formattedDeadline}.` : "Review and decide."}
              </div>
              {decisionError && (
                <div role="alert" className="text-xs text-rejected-text font-medium">
                  {decisionError}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDecision("rejected")}
                  disabled={decisionSubmitting !== null}
                  className="px-4 py-2 rounded-[6px] border border-line bg-surface hover:bg-paper text-xs font-medium text-ink transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {decisionSubmitting === "rejected" ? "Rejecting..." : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision("approved")}
                  disabled={decisionSubmitting !== null}
                  className="px-5 py-2 rounded-[6px] bg-signal hover:bg-signal-hover text-surface text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {decisionSubmitting === "approved" ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          )}

          {post.status === "approved" && (
            <div className="p-4 rounded-[10px] bg-signal-soft border border-signal-border text-xs text-signal font-medium">
              Approved. It will be published around {formattedPublishAt || "the scheduled time"}.
            </div>
          )}

          {post.status === "rejected" && (
            <div className="p-4 rounded-[10px] bg-rejected-bg border border-[#F5C2B9] text-xs text-rejected-text font-medium">
              Rejected. Nothing will be published for this draft.
            </div>
          )}

          {post.status === "expired" && (
            <div className="p-4 rounded-[10px] bg-surface border border-line text-xs text-muted font-medium">
              This draft expired before a decision was made. Nothing was published.
            </div>
          )}

          {post.status === "publishing" && (
            <div className="p-4 rounded-[10px] bg-paper border border-line text-xs text-muted flex items-center gap-2.5">
              <svg
                className="w-3.5 h-3.5 animate-spin text-muted shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span>Publishing now.</span>
            </div>
          )}

          {post.status === "published" && (
            <div className="p-4 rounded-[10px] bg-paper border border-line text-xs space-y-2">
              <div className="text-ink font-semibold">Live on LinkedIn.</div>
              {linkedInPublication?.published_at && (
                <div className="text-muted">
                  Published {formatDecisionDeadline(linkedInPublication.published_at)}.
                </div>
              )}
              {linkedInPublication?.external_url && (
                <div className="pt-1">
                  <a
                    href={linkedInPublication.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-signal hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    <span>View on LinkedIn</span>
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          )}

          {post.status === "failed" && (
            <div
              className={`p-4 rounded-[10px] border text-xs space-y-3 ${
                pubErrorInfo.isWarning
                  ? "bg-draft-bg border-[#F5E5BA] text-draft-text"
                  : "bg-rejected-bg border-[#F5C2B9] text-rejected-text"
              }`}
            >
              <p className="font-medium">{pubErrorInfo.message}</p>

              {retryError && (
                <div role="alert" className="text-xs text-rejected-text font-medium">
                  {retryError}
                </div>
              )}

              {pubErrorInfo.action === "reconnect" && (
                <div>
                  <Link
                    href="/app"
                    className="inline-flex items-center gap-1 font-semibold text-ink underline hover:text-signal"
                  >
                    Reconnect LinkedIn
                  </Link>
                </div>
              )}

              {pubErrorInfo.action === "confirm_retry" && (
                <div className="space-y-3 pt-2 border-t border-line/40">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-normal">
                    <input
                      type="checkbox"
                      checked={confirmedNotPosted}
                      onChange={(e) => setConfirmedNotPosted(e.target.checked)}
                      className="rounded border-line"
                    />
                    <span>I checked and it is not on LinkedIn</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!confirmedNotPosted || retrySubmitting}
                    className="px-4 py-2 rounded-[6px] bg-surface text-ink border border-line font-medium hover:bg-paper disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {retrySubmitting ? "Retrying..." : "Post again"}
                  </button>
                </div>
              )}

              {pubErrorInfo.action === "retry" && (
                <div>
                  <button
                    type="button"
                    onClick={handleSimpleRetry}
                    disabled={retrySubmitting}
                    className="px-4 py-2 rounded-[6px] bg-surface text-ink border border-line font-medium hover:bg-paper disabled:opacity-50 cursor-pointer"
                  >
                    {retrySubmitting ? "Retrying..." : "Try again"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Shared Post Preview Component */}
          <PostPreview
            imageUrl={imageUrl}
            imageLoading={imageLoading}
            imageError={imageError}
            caption={post.caption}
            hashtags={post.hashtags}
            imageAlt={post.topic_title}
          />
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

      {/* Confirmation Modal for Outcome Unknown Retry */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="w-full max-w-[440px] bg-surface border border-line rounded-[12px] p-6 space-y-4 shadow-lg text-left">
            <h3 className="text-base font-semibold text-ink">Confirm Post Retry</h3>
            <p className="text-xs text-muted leading-relaxed">
              Please verify that this post is not live on your LinkedIn feed. Retrying may create a duplicate if the post was already published.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 rounded-[6px] border border-line bg-surface hover:bg-paper text-xs text-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedRetry}
                disabled={retrySubmitting}
                className="px-4 py-1.5 rounded-[6px] bg-signal hover:bg-signal-hover text-surface text-xs font-semibold cursor-pointer"
              >
                {retrySubmitting ? "Retrying..." : "Yes, post again"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
