"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sanitizeTags } from "@/lib/tags";
import { cn } from "@/lib/utils";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  className?: string;
}

// TagInput allows users to enter tags separated by commas or enter key
export function TagInput({
  tags,
  onChange,
  placeholder = "Add niche or tag and press Enter...",
  maxTags = 10,
  disabled = false,
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const combined = [...tags, trimmed];
    const cleaned = sanitizeTags(combined);
    onChange(cleaned);
    setInputValue("");
  };

  const removeTag = (indexToRemove: number) => {
    onChange(tags.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-card p-2 text-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
        disabled && "opacity-50 cursor-not-allowed bg-muted",
        className
      )}
    >
      {tags.map((tag, index) => (
        <Badge
          key={`${tag}-${index}`}
          variant="secondary"
          className="gap-1 pr-1 text-xs"
        >
          <span>{tag}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="rounded-full hover:bg-muted-foreground/20 p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label={`Remove tag ${tag}`}
            >
              <XIcon className="size-3" />
            </button>
          )}
        </Badge>
      ))}

      {tags.length < maxTags && !disabled && (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              addTag(inputValue);
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-32 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
      )}
    </div>
  );
}
