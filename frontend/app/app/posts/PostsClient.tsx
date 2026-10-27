"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
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
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { PostDecisionBadge } from "@/components/app/PostDecisionBadge";
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

// Dynamic import for heavy slide-over / drawer overlay component
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

export function PostsClient({ user }: PostsClientProps) {
  const [activeTab, setActiveTab] = React.useState<PostsTabFilter>("all");
  const [items, setItems] = React.useState<PostListItem[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // Quick view sheet / drawer overlay state
  const [quickViewPost, setQuickViewPost] = React.useState<PostListItem | null>(null);
  const [quickViewOpen, setQuickViewOpen] = React.useState(false);

  // Query server posts for currently selected status filter
  const statusParam = mapTabToStatusFilter(activeTab);
  const { data, isLoading, isError, error, refetch } = usePostsQuery(user.id, {
    status: statusParam,
    limit: 20,
  });

  // Synchronize query results with local items list during render when query data updates
  const [prevData, setPrevData] = React.useState(data);
  if (data && data !== prevData) {
    setPrevData(data);
    setItems(data.items);
    setNextCursor(data.next_cursor);
  }

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
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.next_cursor);
    } catch {
      // Error handled silently, user can retry
    } finally {
      setLoadingMore(false);
    }
  };

  const handleOpenQuickView = (post: PostListItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setQuickViewPost(post);
    setQuickViewOpen(true);
  };

  // Table columns definition with TanStack Table helper
  const columnHelper = React.useMemo(
    () => createColumnHelper<typeof features, PostListItem>(),
    []
  );

  const columns = React.useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("run_date", {
          header: "Date",
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {formatRunDate(row.original.run_date)}
            </span>
          ),
        }),
        columnHelper.accessor("topic_title", {
          header: "Topic",
          cell: ({ row }) => (
            <div className="space-y-0.5 max-w-lg min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {row.original.topic_title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {row.original.caption_preview || "No caption preview available"}
              </p>
            </div>
          ),
        }),
        columnHelper.accessor("status", {
          header: () => <div className="text-right">Status</div>,
          cell: ({ row }) => (
            <div className="text-right whitespace-nowrap">
              <PostDecisionBadge post={row.original} />
            </div>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <div
              className="text-right whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Post actions"
                  >
                    <MoreHorizontalIcon className="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() => handleOpenQuickView(row.original)}
                    className="cursor-pointer"
                  >
                    <EyeIcon className="size-4 mr-2" />
                    <span>Quick view</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/app/posts/${row.original.id}`}
                      className="flex items-center cursor-pointer"
                    >
                      <ExternalLinkIcon className="size-4 mr-2" />
                      <span>Open full page</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        }),
      ]),
    [columnHelper]
  );

  const table = useTable({
    features,
    data: items,
    columns,
    getRowId: (row) => row.id,
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Posts"
        description="Review, inspect, and track all daily generated LinkedIn drafts."
      />

      {/* Tabs filter */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as PostsTabFilter)}
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
      {isLoading ? (
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
      ) : items.length === 0 ? (
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
          {/* Desktop & Tablet Table (>=640px) */}
          <Card className="overflow-hidden hidden sm:block">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
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
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile Stacked Rows (<640px) */}
          <div className="space-y-3 sm:hidden">
            {items.map((post) => (
              <Card
                key={post.id}
                onClick={() => handleOpenQuickView(post)}
                className="p-4 cursor-pointer hover:border-primary/50 transition-colors space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatRunDate(post.run_date)}
                  </span>
                  <PostDecisionBadge post={post} layout="horizontal" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {post.topic_title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {post.caption_preview || "No caption preview available"}
                  </p>
                </div>
                <div className="pt-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleOpenQuickView(post, e)}
                    className="text-xs text-primary"
                  >
                    Quick view
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Load more cursor pagination */}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin mr-2" />
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

      {/* Slide-over quick view sheet on desktop / bottom drawer on mobile */}
      <PostQuickView
        post={quickViewPost}
        open={quickViewOpen}
        onOpenChange={setQuickViewOpen}
      />
    </div>
  );
}
