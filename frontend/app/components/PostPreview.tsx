"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface PostPreviewProps {
  imageUrl?: string | null;
  imageLoading?: boolean;
  imageError?: boolean;
  caption: string;
  hashtags?: string[];
  imageAlt?: string;
}

// Shared component displaying the post image, caption with line breaks, and hashtags
export function PostPreview({
  imageUrl,
  imageLoading = false,
  imageError = false,
  caption,
  hashtags,
  imageAlt = "Post graphic preview",
}: PostPreviewProps) {
  return (
    <div className="space-y-6 w-full">
      {/* Branded image container with square aspect ratio */}
      <div className="relative aspect-square w-full bg-card border border-border rounded-lg overflow-hidden flex items-center justify-center">
        {imageLoading && (
          <Skeleton className="absolute inset-0 size-full" />
        )}

        {imageUrl && !imageLoading && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt={imageAlt}
            className="size-full object-cover"
          />
        )}

        {imageError && !imageLoading && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Image preview unavailable right now.
          </div>
        )}
      </div>

      {/* Post caption preserving line breaks and paragraph spacing */}
      <div className="p-6 rounded-lg bg-card border border-border text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans">
        {caption}
      </div>

      {/* Hashtags list */}
      {hashtags && hashtags.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {hashtags.map((tag, idx) => (
            <span key={idx} className="hover:text-foreground transition-colors font-mono">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
