"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { env } from "@/lib/env";
import { formatDecisionDeadline } from "@/lib/posts";
import { PostPreview } from "@/app/components/PostPreview";
import type { PublicApprovalData, PublicApprovalState } from "@/types/posts";

interface ApprovePageClientProps {
  token: string;
}

export function ApprovePageClient({ token }: ApprovePageClientProps) {
  const [data, setData] = useState<PublicApprovalData | null>(null);
  const [state, setState] = useState<PublicApprovalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInvalidLink, setIsInvalidLink] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // Submitting state for the decision action
  const [submittingDecision, setSubmittingDecision] = useState<"approved" | "rejected" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ref to programmatically move focus to the updated heading on state changes
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Focus the heading whenever state changes
  useEffect(() => {
    if (headingRef.current) {
      headingRef.current.focus();
    }
  }, [state, isInvalidLink, networkError]);

  // Fetch the public approval payload on initial mount
  useEffect(() => {
    let isMounted = true;

    async function loadApprovalData() {
      setLoading(true);
      setNetworkError(null);
      setIsInvalidLink(false);

      const apiUrl = env.apiUrl.replace(/\/+$/, "");
      const url = `${apiUrl}/public/approvals/${encodeURIComponent(token)}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (!isMounted) return;

        if (response.status === 404) {
          setIsInvalidLink(true);
          return;
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const code = errData?.error?.code;
          if (code === "not_found") {
            setIsInvalidLink(true);
            return;
          }
          throw new Error(errData?.error?.message || "Failed to load approval details.");
        }

        const json: PublicApprovalData = await response.json();
        setData(json);
        setState(json.state);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Network error. Please try again.";
        setNetworkError(msg);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadApprovalData();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handles decision submission via public POST endpoint
  async function handleDecision(decision: "approved" | "rejected") {
    setSubmittingDecision(decision);
    setActionError(null);

    const apiUrl = env.apiUrl.replace(/\/+$/, "");
    const url = `${apiUrl}/public/approvals/${encodeURIComponent(token)}/decision`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ decision }),
      });

      if (response.status === 404) {
        setIsInvalidLink(true);
        return;
      }

      if (response.status === 410) {
        setState("expired");
        return;
      }

      if (response.status === 409) {
        const errJson = await response.json().catch(() => ({}));
        const msg = (errJson?.error?.message || "").toLowerCase();
        if (msg.includes("rejected")) {
          setState("rejected");
        } else {
          setState("approved");
        }
        return;
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || "Could not record decision.");
      }

      // Transition smoothly to chosen state
      setState(decision);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error while saving decision.";
      setActionError(msg);
    } finally {
      setSubmittingDecision(null);
    }
  }

  // 404 Invalid Link State
  if (isInvalidLink) {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col">
        <header className="border-b border-line bg-surface/90 backdrop-blur-md px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-geist font-normal tracking-tighter text-xl text-ink">
            AutoPulse
          </Link>
        </header>

        <main className="flex-1 max-w-[560px] w-full mx-auto px-6 py-16 text-left space-y-4">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-geist font-normal text-ink outline-none"
          >
            This link is not valid.
          </h1>
          <p className="text-sm text-muted">
            The link you followed may be incorrect, expired, or belongs to another draft.
          </p>
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-signal hover:underline"
            >
              Return to home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col">
        <header className="border-b border-line bg-surface/90 backdrop-blur-md px-6 h-16 flex items-center justify-between">
          <div className="font-geist font-normal tracking-tighter text-xl text-ink">AutoPulse</div>
        </header>

        <main className="flex-1 max-w-[560px] w-full mx-auto px-6 py-10 space-y-6 animate-pulse text-left">
          <div className="space-y-2">
            <div className="h-7 w-56 bg-line rounded" />
            <div className="h-4 w-72 bg-line rounded" />
          </div>
          <div className="aspect-square w-full bg-line rounded-[12px]" />
          <div className="h-28 bg-line rounded-[12px]" />
        </main>
      </div>
    );
  }

  // Network error on initial load
  if (networkError || !data) {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col">
        <header className="border-b border-line bg-surface/90 backdrop-blur-md px-6 h-16 flex items-center justify-between">
          <div className="font-geist font-normal tracking-tighter text-xl text-ink">AutoPulse</div>
        </header>

        <main className="flex-1 max-w-[560px] w-full mx-auto px-6 py-16 text-left space-y-4">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-geist font-normal text-rejected-text outline-none"
          >
            Something went wrong
          </h1>
          <p className="text-sm text-muted">{networkError || "Could not load post details."}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-[6px] bg-surface text-ink border border-line text-xs font-medium hover:bg-paper cursor-pointer"
          >
            Try again
          </button>
        </main>
      </div>
    );
  }

  // Formatted deadline and publish time
  const formattedDeadline = formatDecisionDeadline(data.expires_at, data.timezone);
  const formattedPublishAt = formatDecisionDeadline(data.publish_at, data.timezone);

  // Directly construct image URL using the public image endpoint
  const apiUrlClean = env.apiUrl.replace(/\/+$/, "");
  const imageUrl = `${apiUrlClean}/public/approvals/${encodeURIComponent(token)}/image.png`;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col selection:bg-signal-soft selection:text-signal">
      {/* Top clean header */}
      <header className="border-b border-line bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[560px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-[7px] bg-surface border border-line flex items-center justify-center text-signal group-hover:border-signal/40 transition-colors">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12h5l3-7 4 14 3-7h3" />
              </svg>
            </div>
            <span className="font-geist font-normal tracking-tighter text-lg text-ink">
              AutoPulse
            </span>
          </Link>
          <div className="text-xs text-muted">Post review</div>
        </div>
      </header>

      {/* Main post review body */}
      <main className="flex-1 max-w-[560px] w-full mx-auto px-6 py-8 pb-32 sm:pb-12 text-left space-y-6">
        {/* Status header region with aria-live announcement */}
        <div aria-live="polite" className="space-y-1">
          {state === "pending" && (
            <>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl font-geist font-normal tracking-tight text-ink outline-none"
              >
                Review today&apos;s post
              </h1>
              {formattedDeadline && (
                <p className="text-xs text-muted">
                  Decide before {formattedDeadline}. After that this draft is skipped.
                </p>
              )}
            </>
          )}

          {state === "approved" && (
            <div className="p-4 rounded-[10px] bg-signal-soft border border-signal-border space-y-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-base font-semibold text-signal outline-none"
              >
                Approved. It will be published around {formattedPublishAt || "the scheduled time"}.
              </h1>
              <p className="text-xs text-signal/80">
                You can close this tab now. AutoPulse will post it to your connected LinkedIn profile.
              </p>
            </div>
          )}

          {state === "rejected" && (
            <div className="p-4 rounded-[10px] bg-rejected-bg border border-[#F5C2B9] space-y-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-base font-semibold text-rejected-text outline-none"
              >
                Rejected. Nothing will be published for this draft.
              </h1>
              <p className="text-xs text-rejected-text/80">
                Your feedback helps tailor tomorrow&apos;s recommendations.
              </p>
            </div>
          )}

          {state === "expired" && (
            <div className="p-4 rounded-[10px] bg-surface border border-line space-y-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-base font-semibold text-muted outline-none"
              >
                This draft has expired. Nothing was published.
              </h1>
              <p className="text-xs text-muted">
                The scheduled publication window has passed.
              </p>
            </div>
          )}
        </div>

        {/* Action error banner */}
        {actionError && (
          <div
            role="alert"
            className="p-3.5 rounded-[8px] bg-rejected-bg border border-[#F5C2B9] text-xs text-rejected-text"
          >
            {actionError}
          </div>
        )}

        {/* Shared Post Preview with image, caption, and hashtags */}
        <PostPreview
          imageUrl={imageUrl}
          caption={data.caption}
          hashtags={data.hashtags}
          imageAlt={data.topic_title}
        />

        {/* Action buttons (sticky bar on mobile, static on desktop) */}
        {state === "pending" && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface/95 backdrop-blur-md border-t border-line sm:static sm:p-0 sm:border-0 sm:bg-transparent z-30">
            <div className="max-w-[560px] mx-auto flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => handleDecision("rejected")}
                disabled={submittingDecision !== null}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-[8px] border border-line bg-surface hover:bg-paper text-xs font-medium text-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submittingDecision === "rejected" ? "Rejecting..." : "Reject"}
              </button>

              <button
                type="button"
                onClick={() => handleDecision("approved")}
                disabled={submittingDecision !== null}
                className="flex-1 sm:flex-none px-6 py-2.5 rounded-[8px] bg-signal hover:bg-signal-hover text-surface text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submittingDecision === "approved" ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
