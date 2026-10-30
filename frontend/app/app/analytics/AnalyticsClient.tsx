"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ExternalLinkIcon,
  HelpCircleIcon,
  InfoIcon,
  PenSquareIcon,
  SlidersIcon,
} from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { AnalyticsSkeleton } from "@/components/app/AnalyticsSkeleton";
import { ErrorState } from "@/components/app/ErrorState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAnalyticsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type {
  AnalyticsRange,
  AnalyticsRecentPost,
  ApprovalTurnaroundMetric,
  DailyPostBucket,
  FunnelStage,
  HookStyleMetric,
  TopicMetric,
} from "@/types/analytics";

interface AnalyticsClientProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
}

const VALID_RANGES: AnalyticsRange[] = ["7d", "30d", "90d"];

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const postsOverTimeConfig = {
  published: {
    label: "Published",
    color: "var(--chart-2)",
  },
  in_pipeline: {
    label: "Draft / Reviewed",
    color: "var(--chart-1)",
  },
  outcome_unknown: {
    label: "Outcome unknown",
    color: "var(--chart-4)",
  },
  failed: {
    label: "Failed",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

const funnelChartConfig = {
  count: {
    label: "Posts",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const turnaroundChartConfig = {
  median: {
    label: "Median (min)",
    color: "var(--chart-1)",
  },
  avg: {
    label: "Average (min)",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

const hookChartConfig = {
  post_count: {
    label: "Generated",
    color: "var(--chart-1)",
  },
  published_count: {
    label: "Published",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const topicChartConfig = {
  post_count: {
    label: "Posts",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3) return isoDate;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatFullDate(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3) return isoDate;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hrs = Math.floor(minutes / 60);
  const rem = Math.round(minutes % 60);
  if (hrs < 24) {
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  }
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
}

function truncateTopicLabel(text: string, maxLen: number = 26): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function ChartEmptyBox({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md border border-dashed border-border bg-secondary/30 px-4 text-center",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function AnalyticsClient({ user }: AnalyticsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawRange = searchParams.get("range");
  const activeRange: AnalyticsRange = VALID_RANGES.includes(
    rawRange as AnalyticsRange
  )
    ? (rawRange as AnalyticsRange)
    : "30d";

  const { data, isLoading, isError, refetch } = useAnalyticsQuery(
    user.id,
    activeRange
  );

  const handleRangeChange = (nextRange: string) => {
    if (!VALID_RANGES.includes(nextRange as AnalyticsRange)) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextRange === "30d") {
      params.delete("range");
    } else {
      params.set("range", nextRange);
    }
    const qs = params.toString();
    router.replace(qs ? `/app/analytics?${qs}` : "/app/analytics", {
      scroll: false,
    });
  };

  if (isLoading && !data) {
    return <AnalyticsSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full min-w-0">
        <PageHeader
          title="Analytics"
          description="Publishing output, approval flow, editorial hook patterns, and draft quality."
        />
        <ErrorState
          message="Could not load analytics data right now."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const {
    summary,
    posts_over_time,
    funnel,
    hook_styles,
    topics,
    approval_turnaround,
    recent_posts,
  } = data;

  const dailySeries = posts_over_time.map((bucket: DailyPostBucket) => {
    const accounted =
      bucket.published + bucket.outcome_unknown + bucket.failed;
    const inPipeline = Math.max(0, bucket.generated - accounted);
    return {
      ...bucket,
      shortDate: formatShortDate(bucket.date),
      in_pipeline: inPipeline,
    };
  });

  const turnaroundChartData = approval_turnaround.map(
    (item: ApprovalTurnaroundMetric) => ({
      ...item,
      median: item.median_minutes ?? 0,
      avg: item.avg_minutes ?? 0,
    })
  );

  const hasTurnaroundDecisions = approval_turnaround.some(
    (item) => item.decisions_count > 0
  );

  const topTopicsChartData = topics.slice(0, 6).map((item: TopicMetric) => ({
    ...item,
    shortTopic: truncateTopicLabel(item.topic, 24),
  }));

  const handleRowClick = (post: AnalyticsRecentPost) => {
    if (post.linkedin_url) {
      window.open(post.linkedin_url, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(`/app/posts/${post.id}`);
  };

  const rangeSelector = (
    <Tabs value={activeRange} onValueChange={handleRangeChange}>
      <TabsList aria-label="Select analytics date range">
        <TabsTrigger value="7d" className="tabular-nums">
          7d
        </TabsTrigger>
        <TabsTrigger value="30d" className="tabular-nums">
          30d
        </TabsTrigger>
        <TabsTrigger value="90d" className="tabular-nums">
          90d
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full min-w-0">
      <PageHeader
        title="Analytics"
        description={`Publishing output, approval turnaround, and draft quality (${summary.timezone}).`}
        actions={rangeSelector}
      />

      {/* LinkedIn API availability notice when r_member_postAnalytics is not present */}
      {!summary.metrics_available && (
        <div
          role="status"
          className="rounded-lg border border-border bg-card px-4 py-3 flex items-start gap-3"
        >
          <InfoIcon className="size-4 text-status-info-fg shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed min-w-0">
            <span className="font-medium text-foreground">
              LinkedIn post reach metrics are unavailable.
            </span>{" "}
            Reading impressions, reactions, comments, and reshares requires
            LinkedIn Community Management API approval (
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs text-foreground">
              r_member_postAnalytics
            </code>
            ). Showing verified pipeline, approval, and publishing analytics
            from your workspace.
          </div>
        </div>
      )}

      {/* Full empty state for brand-new accounts with zero posts all-time */}
      {summary.all_time_posts === 0 ? (
        <Card className="p-8 sm:p-12 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <h2 className="font-display text-lg font-semibold text-foreground">
              No posts generated yet
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Generate your first LinkedIn draft in the playground or configure
              your content profile to start tracking approval velocity, hook
              styles, and publishing history.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button asChild size="sm">
                <Link href="/app/playground">
                  <PenSquareIcon className="size-4" />
                  <span>Open Playground</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/settings?tab=content">
                  <SlidersIcon className="size-4" />
                  <span>Content settings</span>
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Stat cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 1. Published posts */}
            <Card className="p-5 min-h-32 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Published posts
                </span>
                <Badge variant="success">Published</Badge>
              </div>
              <div className="space-y-1 pt-3">
                <div className="font-display text-2xl md:text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {summary.published}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {summary.total_generated > 0
                    ? `${summary.total_generated} generated in ${RANGE_LABELS[activeRange].toLowerCase()}`
                    : `No posts generated in ${RANGE_LABELS[activeRange].toLowerCase()}`}
                </p>
              </div>
            </Card>

            {/* 2. Approval rate */}
            <Card className="p-5 min-h-32 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Approval rate
                </span>
                {summary.awaiting_approval > 0 ? (
                  <Badge variant="warning">
                    {summary.awaiting_approval} pending
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {RANGE_LABELS[activeRange]}
                  </Badge>
                )}
              </div>
              <div className="space-y-1 pt-3">
                <div className="font-display text-2xl md:text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {summary.approval_rate !== null
                    ? `${summary.approval_rate.toFixed(1)}%`
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {summary.total_generated > 0
                    ? `${summary.approved} approved of ${
                        summary.decided_count > 0
                          ? summary.decided_count
                          : summary.total_generated
                      } (${summary.rejected} rejected · ${summary.expired} expired)`
                    : "No approval decisions in this window"}
                </p>
              </div>
            </Card>

            {/* 3. Average AI-slop score (lower is better, neutral/info styling only) */}
            <Card className="p-5 min-h-32 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Average AI score
                </span>
                <Badge variant="info">Lower is better</Badge>
              </div>
              <div className="space-y-1 pt-3">
                <div className="font-display text-2xl md:text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {summary.avg_ai_score !== null
                    ? summary.avg_ai_score.toFixed(1)
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {summary.scored_posts_count > 0
                    ? `Across ${summary.scored_posts_count} scored ${
                        summary.scored_posts_count === 1 ? "post" : "posts"
                      } · lower is better`
                    : "No scored drafts in this window"}
                </p>
              </div>
            </Card>

            {/* 4. Delivery exceptions: Failed & Outcome unknown strictly separated */}
            <Card className="p-5 min-h-32 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Delivery exceptions
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="About outcome unknown posts"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>Outcome unknown</span>
                      <HelpCircleIcon className="size-3.5 text-status-warning-fg" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    LinkedIn may have posted this. Check your profile.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="pt-3 space-y-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-display text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                      {summary.failed}
                    </div>
                    <span className="text-xs text-status-danger-fg font-medium">
                      Failed
                    </span>
                  </div>
                  <div className="border-l border-border pl-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help w-fit">
                          <div className="font-display text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                            {summary.outcome_unknown}
                          </div>
                          <span className="text-xs text-status-warning-fg font-medium">
                            Outcome unknown
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        LinkedIn may have posted this. Check your profile.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Chart 1: Posts over time (continuous daily buckets in user's timezone) */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="font-display text-base">
                    Posts over time
                  </CardTitle>
                  <CardDescription>
                    Daily generated and published posts in {summary.timezone} (
                    {formatShortDate(summary.start_date)} –{" "}
                    {formatShortDate(summary.end_date)})
                  </CardDescription>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {summary.total_generated}{" "}
                  {summary.total_generated === 1 ? "post" : "posts"} total
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {summary.total_generated === 0 ? (
                <ChartEmptyBox
                  message={`No posts generated in the ${RANGE_LABELS[activeRange].toLowerCase()}.`}
                  className="h-64"
                />
              ) : (
                <ChartContainer
                  config={postsOverTimeConfig}
                  className="h-64 w-full aspect-auto"
                >
                  <BarChart
                    data={dailySeries}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="shortDate"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                      domain={[
                        0,
                        (dataMax: number) => Math.max(dataMax + 1, 3),
                      ]}
                    />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as
                          | (DailyPostBucket & { shortDate: string })
                          | undefined;
                        if (!row) return null;
                        return (
                          <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground space-y-1.5 min-w-44">
                            <div className="font-medium text-foreground">
                              {formatFullDate(row.date)}
                            </div>
                            <div className="grid gap-1 tabular-nums">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">
                                  Generated
                                </span>
                                <span className="font-medium text-foreground">
                                  {row.generated}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-status-success-fg">
                                  Published
                                </span>
                                <span className="font-medium text-foreground">
                                  {row.published}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">
                                  Approved
                                </span>
                                <span className="font-medium text-foreground">
                                  {row.approved}
                                </span>
                              </div>
                              {row.outcome_unknown > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-status-warning-fg">
                                    Outcome unknown
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {row.outcome_unknown}
                                  </span>
                                </div>
                              )}
                              {row.failed > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-status-danger-fg">
                                    Failed
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {row.failed}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="published"
                      stackId="daily"
                      fill="var(--color-published)"
                      maxBarSize={22}
                      isAnimationActive={false}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="in_pipeline"
                      stackId="daily"
                      fill="var(--color-in_pipeline)"
                      maxBarSize={22}
                      isAnimationActive={false}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="outcome_unknown"
                      stackId="daily"
                      fill="var(--color-outcome_unknown)"
                      maxBarSize={22}
                      isAnimationActive={false}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="failed"
                      stackId="daily"
                      fill="var(--color-failed)"
                      maxBarSize={22}
                      isAnimationActive={false}
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Row 3: Approval funnel + Approval turnaround */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Approval Funnel */}
            <Card className="flex flex-col justify-between">
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-base">
                  Approval funnel
                </CardTitle>
                <CardDescription>
                  Conversion from generated drafts through approval to live
                  LinkedIn publication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {summary.total_generated === 0 ? (
                  <ChartEmptyBox
                    message="No funnel activity in this date range."
                    className="h-52"
                  />
                ) : (
                  <>
                    <ChartContainer
                      config={funnelChartConfig}
                      className="h-48 w-full aspect-auto"
                    >
                      <BarChart
                        data={funnel.stages}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid
                          horizontal={false}
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          domain={[
                            0,
                            Math.max(summary.total_generated, 1),
                          ]}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={120}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const stage = payload[0]?.payload as
                              | FunnelStage
                              | undefined;
                            if (!stage) return null;
                            return (
                              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground space-y-1 min-w-44">
                                <div className="font-medium text-foreground">
                                  {stage.label}
                                </div>
                                <div className="flex items-center justify-between gap-4 tabular-nums">
                                  <span className="text-muted-foreground">
                                    Share of generated
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {stage.pct_of_generated.toFixed(1)}% (
                                    {stage.count}{" "}
                                    {stage.count === 1 ? "post" : "posts"})
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill="var(--color-count)"
                          maxBarSize={22}
                          isAnimationActive={false}
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ChartContainer>

                    {/* Stage counts + non-published outcomes (outcome_unknown strictly separate) */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {funnel.stages.map((st: FunnelStage) => (
                          <div
                            key={st.stage}
                            className="rounded-md bg-secondary/50 px-2.5 py-2"
                          >
                            <div className="text-xs text-muted-foreground truncate">
                              {st.label}
                            </div>
                            <div className="text-xs font-medium text-foreground tabular-nums mt-0.5">
                              {st.pct_of_generated.toFixed(1)}% ({st.count})
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs tabular-nums">
                        <Badge variant="danger">
                          Rejected: {funnel.rejected}
                        </Badge>
                        <Badge variant="warning">
                          Expired: {funnel.expired}
                        </Badge>
                        <Badge variant="danger">Failed: {funnel.failed}</Badge>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help">
                              <Badge variant="warning">
                                <HelpCircleIcon className="size-3 text-status-warning-fg" />
                                <span>
                                  Outcome unknown: {funnel.outcome_unknown}
                                </span>
                              </Badge>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            LinkedIn may have posted this. Check your profile.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Approval Turnaround by Channel */}
            <Card className="flex flex-col justify-between">
              <CardHeader className="pb-4">
                <CardTitle className="font-display text-base">
                  Approval turnaround
                </CardTitle>
                <CardDescription>
                  Response time from notification dispatch to decision by
                  approval channel
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!hasTurnaroundDecisions ? (
                  <ChartEmptyBox
                    message="No approval turnaround times recorded in this window."
                    className="h-48"
                  />
                ) : (
                  <ChartContainer
                    config={turnaroundChartConfig}
                    className="h-48 w-full aspect-auto"
                  >
                    <BarChart
                      data={turnaroundChartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={46}
                        tickFormatter={(val: number) => `${Math.round(val)}m`}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0]?.payload as
                            | ApprovalTurnaroundMetric
                            | undefined;
                          if (!item) return null;
                          return (
                            <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground space-y-1.5 min-w-48">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground">
                                  {item.label}
                                </span>
                                {item.decisions_count > 0 && item.low_sample && (
                                  <span className="text-muted-foreground">
                                    low sample
                                  </span>
                                )}
                              </div>
                              <div className="grid gap-1 tabular-nums">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    Decisions
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {item.decisions_count}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    Median turnaround
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {formatDurationMinutes(item.median_minutes)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    Average turnaround
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {formatDurationMinutes(item.avg_minutes)}
                                  </span>
                                </div>
                                {item.decisions_count > 0 && (
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">
                                      Range
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {formatDurationMinutes(item.min_minutes)}{" "}
                                      –{" "}
                                      {formatDurationMinutes(item.max_minutes)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar
                        dataKey="median"
                        fill="var(--color-median)"
                        maxBarSize={28}
                        isAnimationActive={false}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="avg"
                        fill="var(--color-avg)"
                        maxBarSize={28}
                        isAnimationActive={false}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                )}

                <div className="divide-y divide-border border-t border-border">
                  {approval_turnaround.map((ch: ApprovalTurnaroundMetric) => {
                    const isLowSample = ch.decisions_count > 0 && ch.low_sample;
                    const isEmpty = ch.decisions_count === 0;
                    return (
                      <div
                        key={ch.source}
                        className={cn(
                          "flex flex-wrap items-center justify-between py-2.5 gap-x-3 gap-y-1 text-xs",
                          (isLowSample || isEmpty) && "opacity-65"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="font-medium text-foreground">
                            {ch.label}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            ({ch.decisions_count}{" "}
                            {ch.decisions_count === 1
                              ? "decision"
                              : "decisions"}
                            )
                          </span>
                          {isLowSample && (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground"
                            >
                              low sample
                            </Badge>
                          )}
                        </div>
                        <div className="tabular-nums text-right shrink-0">
                          {isEmpty ? (
                            <span className="text-muted-foreground">
                              No decisions
                            </span>
                          ) : (
                            <span className="text-foreground font-medium">
                              Median {formatDurationMinutes(ch.median_minutes)}{" "}
                              <span className="text-muted-foreground font-normal">
                                · Avg {formatDurationMinutes(ch.avg_minutes)}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Hook style comparison + Topic breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hook style comparison */}
            <Card className="flex flex-col justify-between">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="font-display text-base">
                      Hook style breakdown
                    </CardTitle>
                    <CardDescription>
                      Output share, approval rate, and AI score by opening hook
                      format
                    </CardDescription>
                  </div>
                  <Badge variant="info">AI score: lower is better</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {hook_styles.length === 0 ? (
                  <ChartEmptyBox
                    message="No hook style data in this date range."
                    className="h-52"
                  />
                ) : (
                  <>
                    <ChartContainer
                      config={hookChartConfig}
                      className="h-56 w-full aspect-auto"
                    >
                      <BarChart
                        data={hook_styles}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid
                          horizontal={false}
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          domain={[
                            0,
                            (dataMax: number) => Math.max(dataMax + 1, 3),
                          ]}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={118}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0]?.payload as
                              | HookStyleMetric
                              | undefined;
                            if (!row) return null;
                            return (
                              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground space-y-1.5 min-w-52">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-foreground">
                                    {row.label}
                                  </span>
                                  {row.low_sample && (
                                    <span className="text-muted-foreground">
                                      low sample
                                    </span>
                                  )}
                                </div>
                                <div className="grid gap-1 tabular-nums">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">
                                      Share of posts
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {row.share_pct.toFixed(1)}% (
                                      {row.post_count})
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">
                                      Approval rate
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {row.approval_rate.toFixed(1)}% (
                                      {row.approved_count}/{row.post_count})
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-status-success-fg">
                                      Published
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {row.published_count}
                                    </span>
                                  </div>
                                  {row.outcome_unknown_count > 0 && (
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-status-warning-fg">
                                        Outcome unknown
                                      </span>
                                      <span className="font-medium text-foreground">
                                        {row.outcome_unknown_count}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">
                                      Avg AI score (lower is better)
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {row.avg_ai_score !== null
                                        ? row.avg_ai_score.toFixed(1)
                                        : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar
                          dataKey="post_count"
                          fill="var(--color-post_count)"
                          maxBarSize={14}
                          isAnimationActive={false}
                          radius={[0, 4, 4, 0]}
                        />
                        <Bar
                          dataKey="published_count"
                          fill="var(--color-published_count)"
                          maxBarSize={14}
                          isAnimationActive={false}
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ChartContainer>

                    <div className="divide-y divide-border border-t border-border">
                      {hook_styles.map((row: HookStyleMetric) => (
                        <div
                          key={row.hook_style}
                          className={cn(
                            "flex flex-wrap items-center justify-between py-2.5 gap-2 text-xs",
                            row.low_sample && "opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-foreground truncate">
                              {row.label}
                            </span>
                            {row.low_sample && (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground shrink-0"
                              >
                                low sample
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 tabular-nums text-muted-foreground shrink-0">
                            <span>
                              <strong className="font-medium text-foreground">
                                {row.share_pct.toFixed(1)}%
                              </strong>{" "}
                              ({row.post_count})
                            </span>
                            <span>
                              Appr{" "}
                              <strong className="font-medium text-foreground">
                                {row.approval_rate.toFixed(0)}%
                              </strong>{" "}
                              ({row.approved_count}/{row.post_count})
                            </span>
                            <span>
                              AI{" "}
                              <strong className="font-medium text-foreground">
                                {row.avg_ai_score !== null
                                  ? row.avg_ai_score.toFixed(1)
                                  : "—"}
                              </strong>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Topic breakdown */}
            <Card className="flex flex-col justify-between">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="font-display text-base">
                      Topic breakdown
                    </CardTitle>
                    <CardDescription>
                      Topics covered, approval rate, and AI score across{" "}
                      {topics.length}{" "}
                      {topics.length === 1 ? "topic" : "topics"}
                    </CardDescription>
                  </div>
                  <Badge variant="info">AI score: lower is better</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {topics.length === 0 ? (
                  <ChartEmptyBox
                    message="No topics recorded in this date range."
                    className="h-52"
                  />
                ) : (
                  <>
                    <ChartContainer
                      config={topicChartConfig}
                      className="h-52 w-full aspect-auto"
                    >
                      <BarChart
                        data={topTopicsChartData}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid
                          horizontal={false}
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          domain={[
                            0,
                            (dataMax: number) => Math.max(dataMax + 1, 3),
                          ]}
                        />
                        <YAxis
                          type="category"
                          dataKey="shortTopic"
                          width={148}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0]?.payload as
                              | TopicMetric
                              | undefined;
                            if (!row) return null;
                            return (
                              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground space-y-1.5 max-w-xs">
                                <div className="font-medium text-foreground leading-snug">
                                  {row.topic}
                                </div>
                                <div className="grid gap-1 tabular-nums">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">
                                      Share of posts
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {row.share_pct.toFixed(1)}% (
                                      {row.post_count})
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">
                                      Approval rate
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {row.approval_rate.toFixed(1)}% (
                                      {row.approved_count}/{row.post_count})
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-muted-foreground">
                                      Avg AI score (lower is better)
                                    </span>
                                    <span className="font-medium text-foreground">
                                      {row.avg_ai_score !== null
                                        ? row.avg_ai_score.toFixed(1)
                                        : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="post_count"
                          fill="var(--color-post_count)"
                          maxBarSize={20}
                          isAnimationActive={false}
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ChartContainer>

                    <div className="divide-y divide-border border-t border-border max-h-64 overflow-y-auto no-scrollbar">
                      {topics.map((item: TopicMetric) => (
                        <div
                          key={item.topic}
                          className={cn(
                            "flex flex-wrap items-center justify-between py-2.5 gap-2 text-xs",
                            item.low_sample && "opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              className="font-medium text-foreground truncate"
                              title={item.topic}
                            >
                              {item.topic}
                            </span>
                            {item.low_sample && (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground shrink-0"
                              >
                                low sample
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 tabular-nums text-muted-foreground shrink-0">
                            <span>
                              <strong className="font-medium text-foreground">
                                {item.share_pct.toFixed(1)}%
                              </strong>{" "}
                              ({item.post_count})
                            </span>
                            <span>
                              Appr{" "}
                              <strong className="font-medium text-foreground">
                                {item.approval_rate.toFixed(0)}%
                              </strong>{" "}
                              ({item.approved_count}/{item.post_count})
                            </span>
                            <span>
                              AI{" "}
                              <strong className="font-medium text-foreground">
                                {item.avg_ai_score !== null
                                  ? item.avg_ai_score.toFixed(1)
                                  : "—"}
                              </strong>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 5: Recent posts table */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="font-display text-base">
                    Recent posts
                  </CardTitle>
                  <CardDescription>
                    Click a published row to open the live post on LinkedIn, or
                    click a draft row to inspect details
                  </CardDescription>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Showing {recent_posts.length} of {summary.total_generated}
                </span>
              </div>
            </CardHeader>

            {recent_posts.length === 0 ? (
              <CardContent>
                <ChartEmptyBox
                  message={`No posts in the ${RANGE_LABELS[activeRange].toLowerCase()}.`}
                  className="h-32"
                />
              </CardContent>
            ) : (
              <div className="border-t border-border overflow-x-auto no-scrollbar">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                      <TableHead className="pl-6">Topic</TableHead>
                      <TableHead>Hook style</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        AI score{" "}
                        <span className="font-normal text-muted-foreground">
                          (lower is better)
                        </span>
                      </TableHead>
                      <TableHead className="text-right pr-6">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent_posts.map((post: AnalyticsRecentPost) => (
                      <TableRow
                        key={post.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleRowClick(post)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleRowClick(post);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-accent/60"
                      >
                        <TableCell className="pl-6 max-w-xs sm:max-w-md">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="font-medium text-foreground truncate"
                              title={post.topic_title}
                            >
                              {post.topic_title}
                            </span>
                            {post.linkedin_url && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    aria-label="Opens on LinkedIn"
                                    className="inline-flex text-muted-foreground shrink-0"
                                  >
                                    <ExternalLinkIcon className="size-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  Open post on LinkedIn
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className="font-normal text-foreground"
                          >
                            {post.hook_label}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={post.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {post.ai_score !== null ? (
                            <span className="font-medium text-foreground">
                              {post.ai_score}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-6 tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatFullDate(post.local_date)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

