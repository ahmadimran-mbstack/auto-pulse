"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, LayoutDashboard, FileText, Share2, Settings, ArrowRight, PenSquare, BarChart3 } from "lucide-react";
import { usePostsQuery } from "@/lib/queries";
import { useUser } from "@/components/providers/user-provider";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { user } = useUser();
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Fetch recent posts to populate command palette search list
  const { data: postsData } = usePostsQuery(user.id, { limit: 10 });
  const recentPosts = postsData?.items || [];

  const pages = [
    { title: "Overview", url: "/app", icon: LayoutDashboard },
    { title: "Analytics", url: "/app/analytics", icon: BarChart3 },
    { title: "Posts", url: "/app/posts", icon: FileText },
    { title: "Playground", url: "/app/playground", icon: PenSquare },
    { title: "Connections", url: "/app/connections", icon: Share2 },
    { title: "Settings", url: "/app/settings", icon: Settings },
  ];


  // Filter pages and posts based on search input
  const filteredPages = pages.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase())
  );

  const filteredPosts = recentPosts.filter((post) =>
    post.topic_title.toLowerCase().includes(query.toLowerCase())
  );

  const allItems = [
    ...filteredPages.map((p) => ({ type: "page" as const, item: p })),
    ...filteredPosts.map((post) => ({ type: "post" as const, item: post })),
  ];

  // Reset selected index when query changes
  const [prevQuery, setPrevQuery] = React.useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setSelectedIndex(0);
  }

  // Handle keyboard navigation inside the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allItems.length) % Math.max(1, allItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = allItems[selectedIndex];
      if (current) {
        if (current.type === "page") {
          router.push(current.item.url);
        } else {
          router.push(`/app/posts/${current.item.id}`);
        }
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeButtonClassName="top-2 right-3"
        className="max-w-xl p-0 gap-0 overflow-hidden border border-border bg-card"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Quick Search and Commands</DialogTitle>
        </DialogHeader>

        {/* Search input bar */}
        <div
          data-input-wrapper
          className="flex items-center border-b border-border pl-3.5 pr-12 h-12 gap-2.5 transition-[border-color] duration-200 ease-in-out focus-within:border-input-focus"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages or recent posts..."
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 shadow-none focus:shadow-none"
          />
        </div>

        {/* Search results list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {allItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found for &quot;{query}&quot;.
            </div>
          ) : (
            <>
              {filteredPages.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Navigation
                  </div>
                  {filteredPages.map((page, idx) => {
                    const isSelected = selectedIndex === idx;
                    const Icon = page.icon;
                    return (
                      <button
                        key={page.url}
                        type="button"
                        onClick={() => {
                          router.push(page.url);
                          onOpenChange(false);
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-left transition-colors",
                          isSelected
                            ? "bg-accent text-foreground font-medium"
                            : "text-foreground hover:bg-accent/60"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="size-4 text-muted-foreground" />
                          <span>{page.title}</span>
                        </div>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredPosts.length > 0 && (
                <div className="pt-2">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Recent Posts
                  </div>
                  {filteredPosts.map((post, postIdx) => {
                    const globalIdx = filteredPages.length + postIdx;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => {
                          router.push(`/app/posts/${post.id}`);
                          onOpenChange(false);
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-left transition-colors",
                          isSelected
                            ? "bg-accent text-foreground font-medium"
                            : "text-foreground hover:bg-accent/60"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{post.topic_title}</span>
                        </div>
                        <span className="text-xs text-muted-foreground capitalize shrink-0 ml-2">
                          {post.status.replace("_", " ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
