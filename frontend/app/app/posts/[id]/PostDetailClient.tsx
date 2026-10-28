"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ExternalLinkIcon,
  Loader2Icon,
  AlertCircleIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/app/PageHeader";
import { PostDecisionBadge } from "@/components/app/PostDecisionBadge";
import { PostTraceSheet } from "@/components/app/PostTraceSheet";
import { Badge } from "@/components/ui/badge";
import { PostPreview } from "@/app/components/PostPreview";
import { PlatformLabel } from "@/components/app/PlatformLabel";
import { PostDetailSkeleton } from "@/components/app/PostDetailSkeleton";
import { ErrorState } from "@/components/app/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUser } from "@/components/providers/user-provider";
import {
  usePostDetailQuery,
  usePostImageQuery,
  useSubmitDecisionMutation,
  useRetryPublicationMutation,
} from "@/lib/queries";
import {
  formatRunDate,
  formatDecisionDeadline,
  getPublicationErrorInfo,
} from "@/lib/posts";

interface PostDetailClientProps {
  id: string;
}

// Extracts clean hostname without leading www
function extractHostname(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

export function PostDetailClient({ id }: PostDetailClientProps) {
  const { user } = useUser();

  // Load post details and 480px branded image in parallel
  const {
    data: post,
    isLoading: postLoading,
    isError: postError,
    error,
    refetch,
  } = usePostDetailQuery(user.id, id);

  const {
    data: imageBlob,
    isLoading: imageLoading,
    isError: imageError,
  } = usePostImageQuery(user.id, id, 480);

  // Convert image blob to local object URL
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!imageBlob) return;

    let active = true;
    const url = URL.createObjectURL(imageBlob);
    Promise.resolve().then(() => {
      if (active) {
        setImageUrl(url);
      }
    });

    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [imageBlob]);

  // Mutations
  const decisionMutation = useSubmitDecisionMutation(user.id);
  const retryMutation = useRetryPublicationMutation(user.id);

  // Modal state for outcome_unknown retry confirmation
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [confirmedNotPosted, setConfirmedNotPosted] = React.useState(false);
  const [showTrace, setShowTrace] = React.useState(false);

  // Poll post data every 10 seconds while status is "publishing"
  React.useEffect(() => {
    if (post?.status !== "publishing") return;

    const intervalId = setInterval(() => {
      refetch();
    }, 10_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [post?.status, refetch]);

  if (postLoading) {
    return <PostDetailSkeleton />;
  }

  if (postError || !post) {
    return (
      <div className="p-6 md:p-8 space-y-4 max-w-lg mx-auto">
        <ErrorState
          message={
            error instanceof Error ? error.message : "We could not load this post."
          }
          onRetry={() => refetch()}
        />
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/posts">Back to posts</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Handle post decision (approve or reject)
  const handleDecision = async (decision: "approved" | "rejected") => {
    try {
      await decisionMutation.mutateAsync({ id, decision });
      toast.success(
        decision === "approved"
          ? "Draft approved for scheduled publishing."
          : "Draft rejected."
      );
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to record decision."
      );
    }
  };

  // Handle simple retry
  const handleSimpleRetry = async () => {
    try {
      await retryMutation.mutateAsync({ id, confirmNotPosted: false });
      toast.success("Publication retry initiated.");
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to retry publishing."
      );
    }
  };

  // Handle confirmed retry for outcome_unknown
  const handleConfirmedRetry = async () => {
    try {
      await retryMutation.mutateAsync({ id, confirmNotPosted: true });
      setShowConfirmModal(false);
      setConfirmedNotPosted(false);
      toast.success("Publication retry initiated.");
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to retry publishing."
      );
    }
  };

  const linkedInPublication =
    post.publications?.find((p) => p.platform === "linkedin") ||
    post.publications?.[0];
  const pubErrorInfo = getPublicationErrorInfo(linkedInPublication?.error_code);
  const formattedPublishAt = formatDecisionDeadline(post.publish_at);
  const formattedDeadline = formatDecisionDeadline(
    post.publish_at || post.approval?.expires_at
  );

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Breadcrumb navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/app/posts">Posts</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate max-w-xs sm:max-w-md">
              {post.topic_title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Page Header */}
      <PageHeader
        title={post.topic_title}
        description={`Draft prepared for ${formatRunDate(post.run_date)}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {post.ai_score !== null && post.ai_score !== undefined && (
              <Badge variant="secondary" className="font-normal text-xs">
                AI-slop check {post.ai_score} / 100
              </Badge>
            )}
            {post.needs_review && (
              <Badge variant="outline" className="font-normal text-xs">
                Needs review
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTrace(true)}
              className="gap-1.5 h-8 text-xs"
            >
              <HelpCircleIcon className="size-3.5" />
              <span>How this was written</span>
            </Button>
            <PostDecisionBadge post={post} layout="horizontal" />
          </div>
        }
      />

      {/* Status Alert Section positioned prominently */}
      {post.status === "awaiting_approval" && (
        <Alert className="border-primary/30 bg-signal-soft/40">
          <AlertCircleIcon className="size-4 text-primary" />
          <div className="flex-1">
            <AlertTitle className="text-foreground">
              Awaiting your approval
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-0.5">
              {formattedDeadline
                ? `Please review and decide before ${formattedDeadline}.`
                : "Please review and decide on this draft."}
            </AlertDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDecision("rejected")}
              disabled={decisionMutation.isPending}
            >
              {decisionMutation.isPending &&
              decisionMutation.variables?.decision === "rejected" ? (
                <Loader2Icon className="size-3.5 animate-spin mr-1" />
              ) : null}
              <span>Reject</span>
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => handleDecision("approved")}
              disabled={decisionMutation.isPending}
            >
              {decisionMutation.isPending &&
              decisionMutation.variables?.decision === "approved" ? (
                <Loader2Icon className="size-3.5 animate-spin mr-1" />
              ) : null}
              <span>Approve</span>
            </Button>
          </div>
        </Alert>
      )}

      {post.status === "approved" && (
        <Alert className="border-signal-line bg-signal-soft text-foreground">
          <CheckCircle2Icon className="size-4 text-primary" />
          <div className="flex-1">
            <AlertTitle className="text-primary font-medium flex items-center gap-1.5">
              <span>Approved</span>
              {post.approval?.channel && (
                <span className="text-xs font-normal text-muted-foreground">
                  via {post.approval.channel === "slack" ? "Slack" : "Email"}
                </span>
              )}
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              This post will be published around {formattedPublishAt || "the scheduled time"}.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {post.status === "publishing" && (
        <Alert className="border-border bg-muted/60">
          <Loader2Icon className="size-4 animate-spin text-primary" />
          <div className="flex-1">
            <AlertTitle>Publishing in progress</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground flex items-center gap-1">
              <span>Delivering post to</span>
              <PlatformLabel platform="linkedin" size="xs" />
              <span>. This page will update automatically when complete.</span>
            </AlertDescription>
          </div>
        </Alert>
      )}

      {post.status === "published" && (
        <Alert className="border-border bg-card">
          <CheckCircle2Icon className="size-4 text-primary" />
          <div className="flex-1">
            <AlertTitle className="inline-flex items-center gap-1.5">
              <span>Published to</span>
              <PlatformLabel platform="linkedin" size="sm" />
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Successfully delivered to your profile.
            </AlertDescription>
          </div>
          {linkedInPublication?.external_url && (
            <Button asChild size="sm" variant="outline">
              <a
                href={linkedInPublication.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                <span>View on</span>
                <PlatformLabel platform="linkedin" size="xs" />
                <ExternalLinkIcon className="size-3.5 ml-1" />
              </a>
            </Button>
          )}
        </Alert>
      )}

      {post.status === "rejected" && (
        <Alert variant="destructive">
          <AlertCircleIcon className="size-4" />
          <div className="flex-1">
            <AlertTitle>Rejected</AlertTitle>
            <AlertDescription className="text-xs">
              This draft was rejected and will not be published.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {post.status === "expired" && (
        <Alert>
          <AlertCircleIcon className="size-4 text-muted-foreground" />
          <div className="flex-1">
            <AlertTitle>Expired</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              This draft passed its review deadline before approval. Nothing was published.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {post.status === "failed" && (
        <Alert variant="destructive">
          <AlertCircleIcon className="size-4" />
          <div className="flex-1">
            <AlertTitle>Publishing failed</AlertTitle>
            <AlertDescription className="text-xs">
              {pubErrorInfo.message}
            </AlertDescription>
          </div>
          {pubErrorInfo.action === "reconnect" && (
            <Button asChild size="sm" variant="outline">
              <Link href="/app/connections" className="inline-flex items-center gap-1">
                <span>Reconnect</span>
                <PlatformLabel platform="linkedin" size="xs" />
              </Link>
            </Button>
          )}
          {pubErrorInfo.action === "confirm_retry" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowConfirmModal(true)}
            >
              Retry
            </Button>
          )}
          {pubErrorInfo.action === "retry" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSimpleRetry}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? "Retrying..." : "Retry publishing"}
            </Button>
          )}
        </Alert>
      )}

      {/* Two-column layout: PostPreview on left, Based on sources on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: PostPreview */}
        <div className="lg:col-span-7 space-y-4">
          <PostPreview
            imageAlt={post.topic_title}
            caption={post.caption}
            hashtags={post.hashtags}
            imageUrl={imageUrl}
            imageLoading={imageLoading}
            imageError={imageError}
          />
        </div>

        {/* Right Column: "Based on" Sources */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">
                Based on sources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Primary topic reference */}
              {post.topic_url && (
                <div className="space-y-1 pb-3 border-b border-border">
                  <span className="text-caption font-medium text-muted-foreground">
                    Primary trend
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    {post.topic_title}
                  </p>
                  <a
                    href={post.topic_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <span>{extractHostname(post.topic_url)}</span>
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </div>
              )}

              {/* Verified source references */}
              {post.sources && post.sources.length > 0 ? (
                <div className="space-y-3">
                  <span className="text-caption font-medium text-muted-foreground block">
                    Referenced articles
                  </span>
                  <div className="space-y-2">
                    {post.sources.map((src, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-md border border-border bg-muted/30 space-y-1"
                      >
                        <p className="text-xs font-medium text-foreground line-clamp-2">
                          {src.title}
                        </p>
                        <div className="flex items-center justify-between text-caption text-muted-foreground pt-1">
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <span>{extractHostname(src.url)}</span>
                            <ExternalLinkIcon className="size-3" />
                          </a>
                          {src.published_at && (
                            <span className="tabular-nums">
                              {formatRunDate(src.published_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No additional external sources referenced for this draft.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog for outcome_unknown retries */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Retry Publication</DialogTitle>
            <DialogDescription>
              We were unable to confirm if this post was already published to LinkedIn. Check your profile before retrying to prevent duplicate posts.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-3 py-3">
            <Checkbox
              id="confirmNotPosted"
              checked={confirmedNotPosted}
              onCheckedChange={(checked) => setConfirmedNotPosted(!!checked)}
            />
            <label
              htmlFor="confirmNotPosted"
              className="text-xs text-muted-foreground leading-snug cursor-pointer select-none"
            >
              I verified that this post does not appear on my LinkedIn profile.
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!confirmedNotPosted || retryMutation.isPending}
              onClick={handleConfirmedRetry}
            >
              {retryMutation.isPending ? "Retrying..." : "Confirm and Retry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "How this was written" Sheet Panel */}
      <PostTraceSheet
        open={showTrace}
        onOpenChange={setShowTrace}
        userId={user.id}
        postId={post.id}
      />
    </div>
  );
}
