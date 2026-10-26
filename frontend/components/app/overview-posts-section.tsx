"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Link2, Loader2 } from "lucide-react";
import { PostThumbnail } from "@/components/app/PostThumbnail";
import { StatusRing } from "@/components/app/status-ring";
import { Button } from "@/components/ui/button";
import { formatRunDate } from "@/lib/posts";
import type { PostListItem } from "@/types/posts";

interface OverviewPostsSectionProps {
  posts: PostListItem[];
  viewMode: "grid" | "list";
  brandPrimaryHex?: string | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

// Calculates relative time strings like "1d ago" or falls back to short dates like "Oct 22"
function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const postDate = new Date(dateStr);
  if (isNaN(postDate.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - postDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours <= 0) return "just now";
    return `${diffHours}h ago`;
  }
  if (diffDays <= 7) {
    return `${diffDays}d ago`;
  }
  return postDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function OverviewPostsSection({
  posts,
  viewMode,
  brandPrimaryHex,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: OverviewPostsSectionProps) {
  if (posts.length === 0) {
    return (
      <div data-slot="card" className="rounded-lg border border-card-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No posts matching your search criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {viewMode === "grid" ? (
        // Grid view: single column of cards 24px apart
        <div className="space-y-6">
          {posts.map((post) => {
            const relTime = formatRelativeTime(post.created_at || post.run_date);
            const runDateFormatted = formatRunDate(post.run_date);

            return (
              <Link
                key={post.id}
                href={`/app/posts/${post.id}`}
                data-slot="card"
                className="group block rounded-lg border border-card-border bg-card p-4 transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* Top row: Avatar (32px round), Title in 16px Manrope, Run date, and StatusRing */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      style={{ backgroundColor: brandPrimaryHex || "var(--muted)" }}
                      className="size-8 shrink-0 rounded-full overflow-hidden border border-border flex items-center justify-center text-xs font-semibold text-foreground"
                    >
                      <PostThumbnail
                        postId={post.id}
                        alt={post.topic_title}
                        width={240}
                        className="size-full object-cover rounded-full"
                      />
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-sans text-base font-semibold tracking-tight text-foreground truncate group-hover:underline">
                        {post.topic_title}
                      </h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {runDateFormatted}
                      </p>
                    </div>
                  </div>

                  <StatusRing status={post.status} size={32} />
                </div>

                {/* 12px below: Caption preview line with file-text icon */}
                <div className="mt-3 flex items-center gap-2 text-sm text-foreground truncate">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{post.caption_preview || "No caption preview available"}</span>
                </div>

                {/* 4px below: Meta line with link icon, source name, dot, and relative time */}
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Link2 className="size-3.5 shrink-0" />
                  <span>AutoPulse</span>
                  <span>·</span>
                  <span>{relTime}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        // List view: compact 48px rows
        <div className="space-y-2">
          {posts.map((post) => {
            const relTime = formatRelativeTime(post.created_at || post.run_date);

            return (
              <Link
                key={post.id}
                href={`/app/posts/${post.id}`}
                data-slot="card"
                className="flex h-12 items-center justify-between px-3.5 rounded-lg border border-card-border bg-card transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <div
                    style={{ backgroundColor: brandPrimaryHex || "var(--muted)" }}
                    className="size-6 shrink-0 rounded-full overflow-hidden border border-border"
                  >
                    <PostThumbnail
                      postId={post.id}
                      alt={post.topic_title}
                      width={240}
                      className="size-full object-cover rounded-full"
                    />
                  </div>
                  <span className="text-sm font-semibold text-foreground truncate max-w-md">
                    {post.topic_title}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                    {relTime}
                  </span>
                </div>

                <StatusRing status={post.status} size={28} />
              </Link>
            );
          })}
        </div>
      )}

      {/* Load more button while next cursor exists */}
      {hasNextPage && onLoadMore && (
        <div className="pt-2 text-center">
          <Button
            type="button"
            variant="ghost"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="h-9 px-4 text-sm font-medium text-foreground hover:bg-accent"
          >
            {isFetchingNextPage ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
