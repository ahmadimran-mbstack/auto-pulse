"use client";

import { TagInput as SharedTagInput } from "@/components/app/TagInput";
import { Label } from "@/components/ui/label";

interface TagInputProps {
  id?: string;
  label?: string;
  hint?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  error?: string;
  maxTags?: number;
  maxTagLength?: number;
  placeholder?: string;
  disabled?: boolean;
}

// Compatibility wrapper for onboarding form fields
export function TagInput({
  id,
  label,
  hint,
  tags,
  onChange,
  error,
  maxTags = 10,
  placeholder = "Add topic and press Enter",
  disabled = false,
}: TagInputProps) {
  return (
    <div className="space-y-1.5 text-left">
      {label && (
        <div className="flex items-center justify-between">
          <Label htmlFor={id} className="text-body font-medium text-foreground">
            {label}
          </Label>
          <span className="text-caption text-muted-foreground font-mono tabular-nums">
            {tags.length} / {maxTags}
          </span>
        </div>
      )}

      {hint && (
        <p className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}

      <SharedTagInput
        tags={tags}
        onChange={onChange}
        maxTags={maxTags}
        placeholder={placeholder}
        disabled={disabled}
      />

      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
