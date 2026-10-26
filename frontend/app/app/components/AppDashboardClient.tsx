"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  useDashboardQuery,
  usePostsQuery,
} from "@/lib/queries";
import { OverviewSkeleton } from "@/components/app/OverviewSkeleton";
import { OverviewToolsRow, type DateFilterRange, type ViewMode } from "@/components/app/overview-tools-row";
import { Last30DaysCard } from "@/components/app/last-30-days-card";
import { AlertsCard } from "@/components/app/alerts-card";
import { TodayCard } from "@/components/app/today-card";
import { OverviewPostsSection } from "@/components/app/overview-posts-section";
import { Button } from "@/components/ui/button";
import { mapTabToStatusFilter, type PostsTabFilter } from "@/lib/posts";
import { AlertCircle } from "lucide-react";

interface AppDashboardClientProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
  apiUrl?: string;
}

export function AppDashboardClient({ user }: AppDashboardClientProps) {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") as PostsTabFilter | null;
  const mappedStatus = statusParam ? mapTabToStatusFilter(statusParam) : undefined;

  // 1. TanStack Query: Fetch dashboard stats and today preview
  const {
    data: dashboardData,
    isLoading: isDashLoading,
    isError: isDashError,
    refetch: refetchDash,
  } = useDashboardQuery(user.id);

  // 2. TanStack Query: Fetch posts with status filter
  const [limit, setLimit] = React.useState(20);
  const {
    data: postsData,
    isLoading: isPostsLoading,
    isError: isPostsError,
    refetch: refetchPosts,
    isFetching: isFetchingPosts,
  } = usePostsQuery(user.id, {
    status: mappedStatus,
    limit,
  });

  // Client search and filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dateRange, setDateRange] = React.useState<DateFilterRange>("all");

  const storedViewMode = React.useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    (): ViewMode => {
      try {
        const saved = localStorage.getItem("autopulse_overview_view_mode") as ViewMode | null;
        return saved === "grid" || saved === "list" ? saved : "grid";
      } catch {
        return "grid";
      }
    },
    (): ViewMode => "grid"
  );
  const [userViewMode, setUserViewMode] = React.useState<ViewMode | null>(null);
  const viewMode = userViewMode ?? storedViewMode;

  const handleViewModeChange = (mode: ViewMode) => {
    setUserViewMode(mode);
    try {
      localStorage.setItem("autopulse_overview_view_mode", mode);
    } catch {
      // ignore
    }
  };

  // If loading, display skeleton layout matching exact shape
  if (isDashLoading || isPostsLoading) {
    return <OverviewSkeleton />;
  }

  // If initial query fails, display centered error block with Try again button
  if (isDashError || isPostsError || !dashboardData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-status-danger-bg text-status-danger-fg mb-4">
          <AlertCircle className="size-5" />
        </div>
        <h2 className="text-base font-semibold text-foreground mb-1">
          Unable to load dashboard
        </h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Something went wrong while fetching your posts and statistics.
        </p>
        <Button
          onClick={() => {
            refetchDash();
            refetchPosts();
          }}
          className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
        >
          Try again
        </Button>
      </div>
    );
  }

  // Filter posts on client by search query and date range
  const rawPosts = postsData?.items || dashboardData.recent_posts || [];
  const now = new Date();

  const filteredPosts = rawPosts.filter((post) => {
    // Search text filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = post.topic_title?.toLowerCase().includes(q);
      const matchCaption = post.caption_preview?.toLowerCase().includes(q);
      if (!matchTitle && !matchCaption) {
        return false;
      }
    }

    // Date range filter
    if (dateRange !== "all") {
      const postDate = new Date(post.created_at || post.run_date);
      if (!isNaN(postDate.getTime())) {
        const diffDays = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24);
        if (dateRange === "7d" && diffDays > 7) {
          return false;
        }
        if (dateRange === "30d" && diffDays > 30) {
          return false;
        }
      }
    }

    return true;
  });


  return (
    <div className="p-6 md:p-8 space-y-8 max-w-none">
      {/* 1. Tools Row: 36px high, 8px gaps */}
      <OverviewToolsRow
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        connections={dashboardData.connections}
      />

      {/* 2. Responsive Grid: 3fr 4fr on desktop, reordered on mobile */}
      <div className="flex flex-col lg:grid lg:grid-cols-[3fr_4fr] gap-6">
        {/* Section: Alerts (Mobile order 1, Desktop left column row 2) */}
        <section className="order-1 lg:order-none lg:col-start-1 lg:row-start-2 space-y-5">
          <h2 className="font-sans text-base font-normal tracking-tight text-foreground">
            Alerts
          </h2>
          <AlertsCard data={dashboardData} />
        </section>

        {/* Section: Today (Mobile order 2, Desktop left column row 3) */}
        <section className="order-2 lg:order-none lg:col-start-1 lg:row-start-3 space-y-5">
          <h2 className="font-sans text-base font-normal tracking-tight text-foreground">
            Today
          </h2>
          <TodayCard
            today={dashboardData.today}
            schedule={dashboardData.schedule}
            timezone={dashboardData.profile?.timezone}
          />
        </section>

        {/* Section: Last 30 days (Mobile order 4, Desktop left column row 1) */}
        <section className="order-4 lg:order-none lg:col-start-1 lg:row-start-1 space-y-5">
          <h2 className="font-sans text-base font-normal tracking-tight text-foreground">
            Analytics
          </h2>
          <Last30DaysCard
            stats={dashboardData.stats}
            connections={dashboardData.connections}
          />
        </section>

        {/* Section: Posts (Mobile order 3, Desktop right column spanning rows 1-3) */}
        <section className="order-3 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-3 space-y-5">
          <h2 className="font-sans text-base font-normal tracking-tight text-foreground">
            Posts / Drafts
          </h2>
          <OverviewPostsSection
            posts={filteredPosts}
            viewMode={viewMode}
            brandPrimaryHex={dashboardData.profile?.brand_primary_hex}
            hasNextPage={!!postsData?.next_cursor}
            isFetchingNextPage={isFetchingPosts}
            onLoadMore={() => setLimit((prev) => prev + 20)}
          />
        </section>
      </div>
    </div>
  );
}
