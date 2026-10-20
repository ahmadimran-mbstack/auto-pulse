"use client";

import { useState } from "react";

interface TagInputProps {
  id: string;
  label: string;
  hint?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  error?: string;
  maxTags?: number;
  maxTagLength?: number;
  placeholder?: string;
}

export function TagInput({
  id,
  label,
  hint,
  tags,
  onChange,
  error,
  maxTags = 10,
  maxTagLength = 40,
  placeholder = "Type and press Enter or comma",
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [localWarning, setLocalWarning] = useState<string | null>(null);

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const addTag = (textToAdd: string) => {
    setLocalWarning(null);
    const trimmed = textToAdd.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.length > maxTagLength) {
      setLocalWarning(`Tag exceeds maximum length of ${maxTagLength} characters.`);
      return;
    }

    if (tags.length >= maxTags) {
      setLocalWarning(`You can add at most ${maxTags} topics.`);
      return;
    }

    const lower = trimmed.toLowerCase();
    const alreadyExists = tags.some((t) => t.toLowerCase() === lower);
    if (alreadyExists) {
      setInputValue("");
      return;
    }

    onChange([...tags, trimmed]);
    setInputValue("");
  };

  const removeTag = (indexToRemove: number) => {
    setLocalWarning(null);
    onChange(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  };

  return (
    <div className="space-y-1.5 text-left">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <span className="text-xs text-muted font-mono">
          {tags.length} / {maxTags}
        </span>
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}

      {/* Tag container with integrated text input */}
      <div
        className={`min-h-[44px] p-2 rounded-[8px] border bg-surface flex flex-wrap items-center gap-1.5 transition-colors focus-within:outline-2 focus-within:outline-signal focus-within:outline-offset-2 ${
          error || localWarning ? "border-rejected-text" : "border-line"
        }`}
      >
        {tags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-paper border border-line text-xs font-medium text-ink"
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(index)}
              aria-label={`Remove topic ${tag}`}
              className="text-muted hover:text-ink cursor-pointer p-0.5 rounded-sm hover:bg-line/50 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        ))}

        {tags.length < maxTags && (
          <input
            id={id}
            type="text"
            value={inputValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val.includes(",")) {
                addTag(val.replace(",", ""));
              } else {
                setInputValue(val);
              }
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (inputValue.trim()) {
                addTag(inputValue);
              }
            }}
            placeholder={tags.length === 0 ? placeholder : "Add another"}
            aria-describedby={`${hint ? hintId : ""} ${error ? errorId : ""}`.trim() || undefined}
            className="flex-1 min-w-[140px] bg-transparent text-sm text-ink placeholder:text-muted/60 outline-none px-1 py-0.5"
          />
        )}
      </div>

      {/* Error or warning messages */}
      {(error || localWarning) && (
        <p id={errorId} role="alert" className="text-xs text-rejected-text">
          {error || localWarning}
        </p>
      )}
    </div>
  );
}
