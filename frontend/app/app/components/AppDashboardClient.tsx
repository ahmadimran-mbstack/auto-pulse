"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  ClockIcon,
  SparklesIcon,
  Loader2Icon,
  ExternalLinkIcon,
} from "lucide-react";
import {
  useDashboardQuery,
  useGenerateDraftMutation,
  prefetchPosts,
  prefetchPostDetail,
} from "@/lib/queries";
import { PageHeader } from "@/components/app/PageHeader";
import { Section } from "@/components/app/Section";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PostThumbnail } from "@/components/app/PostThumbnail";
import { OverviewSkeleton } from "@/components/app/OverviewSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRunDate, formatNextDraftTime } from "@/lib/posts";
import { getConnectionDisplayState } from "@/lib/connections-state";
import { ApiCheckPanel } from "./ApiCheckPanel";

interface AppDashboardClientProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
  apiUrl?: string;
}

export function AppDashboardClient({ user, apiUrl }: AppDashboardClientProps) {
  const { data, isLoading, isError, error, refetch } = useDashboardQuery(user.id);
  const generateMutation = useGenerateDraftMutation(user.id);

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="py-12">
        <ErrorState
          message={error instanceof Error ? error.message : "Unable to load dashboard overview."}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  // Find LinkedIn connection telemetry from dashboard payload
  const linkedin = data.connections?.find((c) => c.provider === "linkedin") || null;
  const mappedStatus =
    linkedin?.status === "expired"
      ? ("expired" as const)
      : linkedin?.status === "revoked"
      ? ("revoked" as const)
      : ("active" as const);

  const linkedinState = getConnectionDisplayState(
    linkedin
      ? {
          provider: linkedin.provider,
          status: mappedStatus,
          account_name: linkedin.account_name,
          connected_at: linkedin.connected_at || "",
          expires_at: linkedin.expires_at || "",
          days_left: linkedin.days_left ?? 0,
        }
      : null
  );

  // Trigger dev-only draft generation run
  const handleGenerateNow = async () => {
    try {
      await generateMutation.mutateAsync(true);
      toast.success("New draft generated successfully.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Draft generation failed. Try again."
      );
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header with optional dev action */}
      <PageHeader
        title="Overview"
        description="Your daily publishing activity and review queue."
        actions={
          process.env.NODE_ENV !== "production" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateNow}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2Icon className="size-4 animate-spin mr-1.5" />
              ) : (
                <SparklesIcon className="size-4 mr-1.5 text-primary" />
              )}
              <span>Generate a draft now</span>
            </Button>
          ) : null
        }
      />

      {/* Alert banner displayed only when LinkedIn connection needs attention */}
      {linkedinState === "not_connected" && (
        <Alert>
          <AlertCircleIcon className="size-4" />
          <div className="flex-1">
            <AlertTitle>LinkedIn profile not connected</AlertTitle>
            <AlertDescription>
              Connect your LinkedIn profile in Connections to enable automated post publishing.
            </AlertDescription>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/app/connections">Connect LinkedIn</Link>
          </Button>
        </Alert>
      )}

      {linkedinState === "expiring_soon" && (
        <Alert>
          <AlertCircleIcon className="size-4" />
          <div className="flex-1">
            <AlertTitle>LinkedIn connection expiring soon</AlertTitle>
            <AlertDescription>
              Your session expires in {linkedin?.days_left} days. Reconnect now to avoid delivery interruptions.
            </AlertDescription>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/app/connections">Reconnect</Link>
          </Button>
        </Alert>
      )}

      {linkedinState === "expired" && (
        <Alert variant="destructive">
          <AlertCircleIcon className="size-4" />
          <div className="flex-1">
            <AlertTitle>LinkedIn connection expired</AlertTitle>
            <AlertDescription>
              Publishing is paused until you reconnect your LinkedIn profile.
            </AlertDescription>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/app/connections">Reconnect LinkedIn</Link>
          </Button>
        </Alert>
      )}

      {/* Row of four single-level summary cards without trend badges or charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Awaiting approval */}
        <Link
          href="/app/posts?tab=needs_approval"
          onMouseEnter={() => prefetchPosts(user.id, { status: "awaiting_approval" })}
          onFocus={() => prefetchPosts(user.id, { status: "awaiting_approval" })}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <Card className="h-full hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Awaiting approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {data.stats.awaiting_approval}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Drafts ready for your review
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* 2. Published, last 30 days */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Published, last 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
              {data.stats.published_30d}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Delivered to LinkedIn
            </p>
          </CardContent>
        </Card>

        {/* 3. Needs attention */}
        <Link
          href="/app/posts?tab=problems"
          onMouseEnter={() => prefetchPosts(user.id, { status: "failed,rejected,expired" })}
          onFocus={() => prefetchPosts(user.id, { status: "failed,rejected,expired" })}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <Card className="h-full hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Needs attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {data.stats.failed_30d}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Failed or expired drafts
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* 4. LinkedIn connection status */}
        <Link
          href="/app/connections"
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <Card className="h-full hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                LinkedIn
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight truncate text-foreground">
                {linkedinState === "connected" && `${linkedin?.days_left ?? 0} days left`}
                {linkedinState === "expiring_soon" && `${linkedin?.days_left ?? 0} days left`}
                {linkedinState === "expired" && "Expired"}
                {linkedinState === "not_connected" && "Not connected"}
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {linkedin?.account_name || "Connect your profile"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Section: Today */}
      <Section
        title="Today"
        description="The daily draft generated for your approved schedule."
      >
        {!data.today ? (
          !data.profile.onboarding_complete ? (
            <EmptyState
              message="Finish setting up your niche and schedule to start generating daily drafts."
              action={
                <Button asChild size="sm">
                  <Link href="/app/onboarding">Finish setup</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              message={`Next draft scheduled for ${formatNextDraftTime(data.schedule.next_draft_at) || "tomorrow morning"}.`}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/app/posts">View all posts</Link>
                </Button>
              }
            />
          )
        ) : (
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <PostThumbnail
                  postId={data.today.id}
                  alt={data.today.topic_title}
                  width={240}
                  className="size-14 shrink-0"
                />
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {data.today.topic_title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ClockIcon className="size-3.5" />
                    <span>
                      {data.today.publish_at
                        ? `Publish at ${formatRunDate(data.today.run_date)}`
                        : `Run date ${formatRunDate(data.today.run_date)}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                <StatusBadge status={data.today.status} />
                {data.today.status === "awaiting_approval" ? (
                  <Button asChild size="sm" variant="default">
                    <Link href={`/app/posts/${data.today.id}`}>
                      Review and approve
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/app/posts/${data.today.id}`}>View</Link>
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </Section>

      {/* Section: Recent posts */}
      <Section
        title="Recent posts"
        description="The latest 5 drafts generated by your pipeline."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link
              href="/app/posts"
              onMouseEnter={() => prefetchPosts(user.id)}
              className="text-primary hover:text-primary font-medium"
            >
              <span>View all</span>
              <ExternalLinkIcon className="size-3.5 ml-1" />
            </Link>
          </Button>
        }
      >
        {data.recent_posts.length === 0 ? (
          <EmptyState
            message="No posts generated yet."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/app/posts">Explore posts</Link>
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead className="w-40 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_posts.slice(0, 5).map((post) => (
                  <TableRow
                    key={post.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onMouseEnter={() => prefetchPostDetail(user.id, post.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      <Link href={`/app/posts/${post.id}`} className="block size-full">
                        {formatRunDate(post.run_date)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium text-sm text-foreground">
                      <Link href={`/app/posts/${post.id}`} className="block truncate max-w-lg">
                        {post.topic_title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Link href={`/app/posts/${post.id}`} className="inline-block">
                        <StatusBadge status={post.status} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </Section>

      {/* Dev-only inspection panel */}
      {process.env.NODE_ENV !== "production" && (
        <ApiCheckPanel apiUrl={apiUrl || ""} />
      )}
    </div>
  );
}
