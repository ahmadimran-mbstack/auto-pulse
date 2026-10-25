"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { env } from "@/lib/env";
import { formatDecisionDeadline } from "@/lib/posts";
import { PostPreview } from "@/app/components/PostPreview";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
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
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border bg-card px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display font-semibold text-h3 text-foreground">
            AutoPulse
          </Link>
        </header>

        <main className="flex-1 form-container w-full mx-auto px-6 py-16 text-left space-y-4">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-h2 font-display text-foreground outline-none"
          >
            This link is not valid.
          </h1>
          <p className="text-body text-muted-foreground">
            The link you followed may be incorrect, expired, or belongs to another draft.
          </p>
          <div>
            <Button variant="link" asChild className="p-0 text-primary">
              <Link href="/" className="inline-flex items-center gap-1.5">
                <ArrowLeft className="size-4" />
                <span>Return to home</span>
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border bg-card px-6 h-14 flex items-center justify-between">
          <div className="font-display font-semibold text-h3 text-foreground">AutoPulse</div>
        </header>

        <main className="flex-1 form-container w-full mx-auto px-6 py-10 space-y-6 text-left">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </main>
      </div>
    );
  }

  // Network error on initial load
  if (networkError || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border bg-card px-6 h-14 flex items-center justify-between">
          <div className="font-display font-semibold text-h3 text-foreground">AutoPulse</div>
        </header>

        <main className="flex-1 form-container w-full mx-auto px-6 py-16 text-left space-y-4">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-h2 font-display text-destructive outline-none"
          >
            Something went wrong
          </h1>
          <p className="text-body text-muted-foreground">{networkError || "Could not load post details."}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top clean header */}
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="form-container mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="size-7 rounded-md bg-card border border-border flex items-center justify-center text-primary group-hover:border-primary/40 transition-colors">
              <Activity className="size-4" strokeWidth={2} />
            </div>
            <span className="font-display font-semibold text-h3 text-foreground">
              AutoPulse
            </span>
          </Link>
          <div className="text-caption text-muted-foreground font-mono">Post review</div>
        </div>
      </header>

      {/* Main post review body */}
      <main className="flex-1 form-container w-full mx-auto px-6 py-8 pb-32 sm:pb-12 text-left space-y-6">
        {/* Status header region with aria-live announcement */}
        <div aria-live="polite" className="space-y-1">
          {state === "pending" && (
            <>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-title font-display text-foreground outline-none"
              >
                Review today&apos;s post
              </h1>
              {formattedDeadline && (
                <p className="text-caption text-muted-foreground">
                  Decide before {formattedDeadline}. After that this draft is skipped.
                </p>
              )}
            </>
          )}

          {state === "approved" && (
            <Alert className="border-signal-line bg-signal-soft space-y-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-body font-medium text-primary outline-none"
              >
                Approved. It will be published around {formattedPublishAt || "the scheduled time"}.
              </h1>
              <p className="text-caption text-primary/80">
                You can close this tab now. AutoPulse will post it to your connected LinkedIn profile.
              </p>
            </Alert>
          )}

          {state === "rejected" && (
            <Alert variant="destructive" className="space-y-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-body font-medium outline-none"
              >
                Rejected. Nothing will be published for this draft.
              </h1>
              <p className="text-caption opacity-90">
                Your feedback helps tailor tomorrow&apos;s recommendations.
              </p>
            </Alert>
          )}

          {state === "expired" && (
            <Alert className="space-y-1">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-body font-medium text-muted-foreground outline-none"
              >
                This draft has expired. Nothing was published.
              </h1>
              <p className="text-caption text-muted-foreground">
                The scheduled publication window has passed.
              </p>
            </Alert>
          )}
        </div>

        {/* Action error banner */}
        {actionError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4 shrink-0" />
            <AlertDescription className="text-caption">
              {actionError}
            </AlertDescription>
          </Alert>
        )}

        {/* Shared Post Preview with image, caption, and hashtags */}
        <PostPreview
          imageUrl={imageUrl}
          caption={data.caption}
          hashtags={data.hashtags}
          imageAlt={data.topic_title}
        />

        {/* Action buttons */}
        {state === "pending" && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => handleDecision("rejected")}
              disabled={submittingDecision !== null}
            >
              {submittingDecision === "rejected" ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  <span>Rejecting...</span>
                </>
              ) : (
                "Reject"
              )}
            </Button>

            <Button
              type="button"
              size="default"
              onClick={() => handleDecision("approved")}
              disabled={submittingDecision !== null}
            >
              {submittingDecision === "approved" ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  <span>Approving...</span>
                </>
              ) : (
                "Approve"
              )}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
