"use client";

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
      <div className="relative aspect-square w-full bg-paper border border-line rounded-[12px] overflow-hidden flex items-center justify-center">
        {imageLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted animate-pulse bg-paper">
            <svg
              className="w-8 h-8 text-line"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-xs">Loading image...</span>
          </div>
        )}

        {imageUrl && !imageLoading && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt={imageAlt}
            className="w-full h-full object-cover"
          />
        )}

        {imageError && !imageLoading && (
          <div className="p-4 text-center text-xs text-muted">
            Image preview unavailable right now.
          </div>
        )}
      </div>

      {/* Post caption preserving line breaks and paragraph spacing */}
      <div className="p-6 rounded-[12px] bg-surface border border-line text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans">
        {caption}
      </div>

      {/* Hashtags list */}
      {hashtags && hashtags.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {hashtags.map((tag, idx) => (
            <span key={idx} className="hover:text-ink transition-colors">
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
