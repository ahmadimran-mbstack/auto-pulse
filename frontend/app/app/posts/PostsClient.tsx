"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createColumnHelper,
  useTable,
  FlexRender,
  tableFeatures,
  columnVisibilityFeature,
} from "@tanstack/react-table";

const features = tableFeatures({
  columnVisibilityFeature,
});

import {
  MoreHorizontalIcon,
  EyeIcon,
  ExternalLinkIcon,
  Loader2Icon,
  CopyIcon,
  CheckIcon,
  SparklesIcon,
  ArrowUpDownIcon,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { PostDecisionBadge } from "@/components/app/PostDecisionBadge";
import { StatusBadge } from "@/components/app/StatusBadge";
import { PostThumbnail } from "@/components/app/PostThumbnail";
import { PlatformLabel } from "@/components/app/PlatformLabel";
import { PostsSkeleton } from "@/components/app/PostsSkeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePostsQuery, prefetchPostDetail } from "@/lib/queries";
import { getPosts } from "@/lib/api";
import {
  formatRunDate,
  mapTabToStatusFilter,
  type PostsTabFilter,
} from "@/lib/posts";
import type { PostListItem } from "@/types/posts";
import { toast } from "sonner";

// Dynamic import for slide-over quick view component
const PostQuickView = dynamic(
  () => import("@/components/app/PostQuickView").then((m) => m.PostQuickView),
  { ssr: false }
);

interface PostsClientProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
}

// Pastel tag color palettes matching the inspiration design
const TAG_COLOR_PALETTES = [
  "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40",
  "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
  "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
  "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/40",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function getCategoryTags(post: PostListItem): { label: string; colorClass: string }[] {
  const tags: string[] = [];
  if (post.post_format) {
    tags.push(post.post_format.replace(/_/g, " "));
  }
  if (post.topic) {
    tags.push(post.topic);
  }
  if (tags.length === 0 && post.topic_title) {
    const words = post.topic_title
      .split(/[\s,:-]+/)
      .filter(
        (w) =>
          w.length > 3 &&
          !/^(with|from|this|that|your|what|more|some|very|about|when|then)$/i.test(w)
      );
    if (words[0]) tags.push(words[0]);
    if (words[1]) tags.push(words[1]);
  }
  if (tags.length === 0) {
    tags.push("Tech", "Engineering");
  }

  return tags.slice(0, 3).map((tag) => ({
    label: tag,
    colorClass:
      TAG_COLOR_PALETTES[Math.abs(hashString(tag)) % TAG_COLOR_PALETTES.length],
  }));
}

function getAuthenticityPercentage(score: number | null | undefined): number {
  if (score === null || score === undefined) return 93;
  if (score <= 50) return Math.max(70, 100 - score);
  return Math.min(100, score);
}

export function PostsClient({ user }: PostsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status") as PostsTabFilter | null;

  const validTabs: PostsTabFilter[] = [
    "all",
    "needs_approval",
    "scheduled",
    "published",
    "problems",
  ];
  const initialTab: PostsTabFilter =
    urlStatus && validTabs.includes(urlStatus) ? urlStatus : "all";

  const [activeTab, setActiveTab] = React.useState<PostsTabFilter>(initialTab);

  // Sync state if URL query parameter changes
  React.useEffect(() => {
    if (urlStatus && validTabs.includes(urlStatus)) {
      setActiveTab(urlStatus);
    }
  }, [urlStatus]);

  const handleTabChange = (nextTab: PostsTabFilter) => {
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "all") {
      params.delete("status");
    } else {
      params.set("status", nextTab);
    }
    router.push(`/app/posts?${params.toString()}`);
  };

  // Cursor pagination state
  const [extraItems, setExtraItems] = React.useState<PostListItem[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // Quick view sheet state
  const [quickViewPost, setQuickViewPost] = React.useState<PostListItem | null>(null);
  const [quickViewOpen, setQuickViewOpen] = React.useState(false);

  // Query server posts for currently selected status filter
  const statusParam = mapTabToStatusFilter(activeTab);
  const { data, isLoading, isError, error, refetch } = usePostsQuery(user.id, {
    status: statusParam,
    limit: 20,
  });

  // When active tab or fresh query data arrives, update cursor and reset appended pages
  React.useEffect(() => {
    setExtraItems([]);
    setNextCursor(data?.next_cursor ?? null);
  }, [activeTab, data?.next_cursor]);

  // Combined post list: base items from query + extra items loaded via cursor
  const postsList: PostListItem[] = React.useMemo(() => {
    const base = data?.items || [];
    if (extraItems.length === 0) return base;
    return [...base, ...extraItems];
  }, [data?.items, extraItems]);

  // Load more posts using server-side cursor pagination
  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getPosts({
        status: statusParam,
        cursor: nextCursor,
        limit: 20,
      });
      setExtraItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.next_cursor);
    } catch {
      toast.error("Failed to load more posts");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleOpenQuickView = (post: PostListItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setQuickViewPost(post);
    setQuickViewOpen(true);
  };

  const handleCopyText = async (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Caption copied to clipboard");
    } catch {
      toast.error("Failed to copy caption");
    }
  };

  // Table columns definition with TanStack Table helper
  const columnHelper = React.useMemo(
    () => createColumnHelper<typeof features, PostListItem>(),
    []
  );

  const columns = React.useMemo(
    () =>
      columnHelper.columns([
        // 1. Full Name / Post Topic
        columnHelper.accessor("topic_title", {
          header: () => (
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground uppercase tracking-wider">
              <span>Topic / Title</span>
              <ArrowUpDownIcon className="size-3 text-muted-foreground" />
            </div>
          ),
          cell: ({ row }) => {
            const post = row.original;
            return (
              <div
                className="flex items-center gap-3.5 min-w-0 max-w-md cursor-pointer group"
                onClick={() => handleOpenQuickView(post)}
              >
                {/* 40px Circular Avatar */}
                <div className="size-10 rounded-full border border-border bg-muted overflow-hidden shrink-0">
                  <PostThumbnail
                    postId={post.id}
                    alt={post.topic_title}
                    width={240}
                    className="size-full object-cover rounded-full group-hover:scale-105 transition-transform duration-200"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:underline">
                    {post.topic_title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="font-medium text-foreground/75">
                      {formatRunDate(post.run_date)}
                    </span>
                    {post.caption_preview ? ` · ${post.caption_preview}` : ""}
                  </p>
                </div>
              </div>
            );
          },
        }),

        // 2. Channel & Status
        columnHelper.accessor("status", {
          header: () => (
            <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
              Channel & Status
            </span>
          ),
          cell: ({ row }) => {
            const post = row.original;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <PlatformLabel platform="linkedin" size="xs" />
                <StatusBadge status={post.status} />
                {post.approval?.decision && (
                  <PostDecisionBadge post={post} layout="horizontal" />
                )}
              </div>
            );
          },
        }),

        // 3. Category / Tags (Soft Pastel Pills like inspiration)
        columnHelper.display({
          id: "category",
          header: () => (
            <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
              Category
            </span>
          ),
          cell: ({ row }) => {
            const tags = getCategoryTags(row.original);
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                {tags.map((t, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium select-none ${t.colorClass}`}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            );
          },
        }),

        // 4. Authenticity Score (Horizontal bar + percentage like inspiration)
        columnHelper.accessor("ai_score", {
          header: () => (
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground uppercase tracking-wider">
              <span>Authenticity Score</span>
              <ArrowUpDownIcon className="size-3 text-muted-foreground" />
            </div>
          ),
          cell: ({ row }) => {
            const authenticity = getAuthenticityPercentage(row.original.ai_score);
            return (
              <div className="flex items-center gap-3">
                <div className="w-24 sm:w-28 bg-muted rounded-full h-2 overflow-hidden shrink-0">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-300"
                    style={{ width: `${authenticity}%` }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {authenticity}%
                </span>
              </div>
            );
          },
        }),

        // 5. Actions (Quick view, Copy, Detail, 3-dots)
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const post = row.original;
            return (
              <div
                className="flex items-center justify-end gap-1 whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => handleOpenQuickView(post)}
                  title="Quick view"
                >
                  <EyeIcon className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => handleCopyText(post.caption_preview, e)}
                  title="Copy caption"
                >
                  <CopyIcon className="size-4" />
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  title="Open full page"
                >
                  <Link href={`/app/posts/${post.id}`}>
                    <ExternalLinkIcon className="size-4" />
                  </Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      aria-label="More actions"
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => handleOpenQuickView(post)}
                      className="cursor-pointer"
                    >
                      <EyeIcon className="size-4 mr-2" />
                      <span>Quick view</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => handleCopyText(post.caption_preview, e)}
                      className="cursor-pointer"
                    >
                      <CopyIcon className="size-4 mr-2" />
                      <span>Copy caption</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/app/posts/${post.id}`}
                        className="flex items-center cursor-pointer"
                      >
                        <ExternalLinkIcon className="size-4 mr-2" />
                        <span>Open full page</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          },
        }),
      ]),
    [columnHelper]
  );

  const table = useTable({
    features,
    data: postsList,
    columns,
    getRowId: (row) => row.id,
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full min-w-0">
      <PageHeader
        title="Posts"
        description="Review, inspect, and track all daily generated LinkedIn drafts."
      />

      {/* Tabs Filter */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => handleTabChange(val as PostsTabFilter)}
      >
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="needs_approval">Needs approval</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="problems">Problems</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Loading state */}
      {isLoading && postsList.length === 0 ? (
        <PostsSkeleton showHeader={false} />
      ) : isError ? (
        <div className="py-12">
          <ErrorState
            message={
              error instanceof Error
                ? error.message
                : "Unable to load posts for this filter."
            }
            onRetry={() => refetch()}
          />
        </div>
      ) : postsList.length === 0 ? (
        <EmptyState
          message={
            activeTab === "all"
              ? "No posts found in your publishing pipeline."
              : `No posts currently found under ${activeTab.replace("_", " ")}.`
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/app">Return to Overview</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Desktop & Tablet Table (>= 768px) */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs hidden md:block">
            <Table>
              <TableHeader className="bg-muted/30">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan} className="h-12 px-4">
                        {header.isPlaceholder ? null : (
                          <FlexRender header={header} />
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => handleOpenQuickView(row.original)}
                    onMouseEnter={() => prefetchPostDetail(user.id, row.original.id)}
                    className="cursor-pointer hover:bg-muted/30 transition-colors h-16 border-b border-border/60"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3 align-middle">
                        <FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile & Small Tablet Card View (< 768px) */}
          <div className="space-y-3 md:hidden">
            {postsList.map((post) => {
              const tags = getCategoryTags(post);
              const authenticity = getAuthenticityPercentage(post.ai_score);

              return (
                <div
                  key={post.id}
                  onClick={() => handleOpenQuickView(post)}
                  className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors space-y-3 cursor-pointer shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {formatRunDate(post.run_date)}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PlatformLabel platform="linkedin" size="xs" />
                      <StatusBadge status={post.status} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full border border-border bg-muted overflow-hidden shrink-0">
                      <PostThumbnail
                        postId={post.id}
                        alt={post.topic_title}
                        width={240}
                        className="size-full object-cover rounded-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {post.topic_title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {post.caption_preview || "No caption text"}
                      </p>
                    </div>
                  </div>

                  {/* Pastel Tags and Authenticity Score */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tags.slice(0, 2).map((t, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${t.colorClass}`}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${authenticity}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {authenticity}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more cursor pagination */}
          {nextCursor && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="h-9 px-4 gap-2"
              >
                {loadingMore ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    <span>Loading more posts...</span>
                  </>
                ) : (
                  <span>Load more</span>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Slide-over quick view right sidebar */}
      <PostQuickView
        post={quickViewPost}
        open={quickViewOpen}
        onOpenChange={setQuickViewOpen}
      />
    </div>
  );
}
