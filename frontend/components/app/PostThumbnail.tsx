"use client";

import * as React from "react";
import { usePostImageQuery } from "@/lib/queries";
import { useUser } from "@/components/providers/user-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PostThumbnailProps {
  postId: string;
  alt: string;
  width?: 240 | 480 | 1200;
  className?: string;
}

// PostThumbnail loads the post branded image via Bearer-authenticated blob URL with TanStack Query caching
export function PostThumbnail({
  postId,
  alt,
  width = 240,
  className,
}: PostThumbnailProps) {
  const { user } = useUser();
  const { data: blob, isLoading, isError } = usePostImageQuery(user.id, postId, width);
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);

  // Convert blob to local object URL and clean up on unmount or blob change
  React.useEffect(() => {
    if (!blob) return;

    let active = true;
    const url = URL.createObjectURL(blob);
    Promise.resolve().then(() => {
      if (active) {
        setObjectUrl(url);
      }
    });

    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  if (isLoading) {
    return <Skeleton className={cn("rounded-md bg-muted", className)} />;
  }

  if (isError || !objectUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-border bg-muted text-muted-foreground",
          className
        )}
        aria-label="No image available"
      >
        <ImageIcon className="size-4 opacity-50" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={objectUrl}
      alt={alt}
      loading="lazy"
      className={cn("rounded-md object-cover border border-border bg-muted", className)}
    />
  );
}
