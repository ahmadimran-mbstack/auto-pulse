"use client";

import * as React from "react";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { PostDecisionBadge } from "@/components/app/PostDecisionBadge";
import { PostThumbnail } from "@/components/app/PostThumbnail";
import { formatRunDate } from "@/lib/posts";
import type { PostListItem } from "@/types/posts";
import { ExternalLinkIcon } from "lucide-react";

interface PostQuickViewProps {
  post: PostListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// PostQuickView displays a lightweight slide-over sheet on desktop and a bottom drawer on mobile
export function PostQuickView({
  post,
  open,
  onOpenChange,
}: PostQuickViewProps) {
  const isMobile = useIsMobile();

  if (!post) return null;

  const content = (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatRunDate(post.run_date)}
        </span>
        <PostDecisionBadge post={post} layout="horizontal" />
      </div>

      <div className="aspect-square w-full max-w-xs mx-auto overflow-hidden rounded-md border border-border bg-muted">
        <PostThumbnail
          postId={post.id}
          alt={post.topic_title}
          width={480}
          className="size-full object-cover"
        />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">Caption Preview</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6 leading-relaxed">
          {post.caption_preview || "No caption text generated for this draft."}
        </p>
      </div>
    </div>
  );

  const actionFooter = (
    <Button asChild className="w-full">
      <Link href={`/app/posts/${post.id}`}>
        <span>Open full page</span>
        <ExternalLinkIcon className="size-4 ml-1.5" />
      </Link>
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="text-left px-0">
            <DrawerTitle className="text-base truncate">{post.topic_title}</DrawerTitle>
            <DrawerDescription className="text-xs">
              Quick review of today&apos;s candidate draft.
            </DrawerDescription>
          </DrawerHeader>
          {content}
          <DrawerFooter className="px-0 pt-4">{actionFooter}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col justify-between">
        <div>
          <SheetHeader>
            <SheetTitle className="text-base truncate">{post.topic_title}</SheetTitle>
            <SheetDescription className="text-xs">
              Quick review of candidate draft.
            </SheetDescription>
          </SheetHeader>
          {content}
        </div>
        <SheetFooter className="pt-4 border-t border-border">
          {actionFooter}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
