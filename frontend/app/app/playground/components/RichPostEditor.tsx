"use client";

import * as React from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RichPostEditorProps {
  value: string;
  onChange: (htmlContent: string, plainText: string) => void;
  onSubmitShortcut?: () => void;
  disabled?: boolean;
}

export function RichPostEditor({
  value,
  onChange,
  onSubmitShortcut,
  disabled = false,
}: RichPostEditorProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [isBold, setIsBold] = React.useState(false);
  const [isItalic, setIsItalic] = React.useState(false);
  const [isUnderline, setIsUnderline] = React.useState(false);
  const [charCount, setCharCount] = React.useState(0);
  const [isEmpty, setIsEmpty] = React.useState(true);

  // Sync internal HTML content only when external value changes drastically (such as reset or restore)
  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
      const text = editorRef.current.innerText || "";
      const normalizedText = text.replace(/\r\n/g, "\n");
      setCharCount(normalizedText.trim() === "" ? 0 : normalizedText.length);
      setIsEmpty(!value || value.trim() === "" || value === "<br>");
    }
  }, [value]);

  // Inspect the current cursor selection state to highlight active toolbar buttons
  const updateFormattingState = React.useCallback(() => {
    if (typeof document === "undefined") return;
    try {
      setIsBold(document.queryCommandState("bold"));
      setIsItalic(document.queryCommandState("italic"));
      setIsUnderline(document.queryCommandState("underline"));
    } catch {
      // Ignore errors when selection is outside active document
    }
  }, []);

  // Format toggle handler that preserves editor focus and text selection
  const handleFormat = (command: "bold" | "italic" | "underline") => {
    if (disabled || typeof document === "undefined") return;
    document.execCommand(command, false);
    updateFormattingState();
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText || "";
      onChange(html, text);
    }
  };

  // Called on every keystroke or edit inside contentEditable div
  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const rawText = editorRef.current.innerText || "";
    const cleanText = rawText.replace(/\r\n/g, "\n");

    const empty = cleanText.trim() === "" && (!html || html === "<br>");
    setIsEmpty(empty);
    setCharCount(empty ? 0 : cleanText.length);
    onChange(empty ? "" : html, cleanText);
    updateFormattingState();
  };

  // Intercept keyboard shortcuts: Ctrl/Cmd+Enter for submission, Cmd+B/I/U for state update
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (onSubmitShortcut) {
        onSubmitShortcut();
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b" || e.key === "i" || e.key === "u") {
        setTimeout(updateFormattingState, 10);
      }
    }
  };

  const isOverLimit = charCount > 3000;
  const isNearLimit = charCount > 2800 && !isOverLimit;

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-input bg-background transition-colors",
        "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {/* Formatting Toolbar */}
      <div className="flex items-center gap-1 border-b border-border px-2.5 py-1.5 bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Format bold"
          aria-pressed={isBold}
          onMouseDown={(e) => {
            // Prevent editor blur so current selection range is kept
            e.preventDefault();
            handleFormat("bold");
          }}
          className={cn(
            "size-7 p-0 rounded text-muted-foreground hover:text-foreground hover:bg-accent",
            isBold && "bg-accent text-foreground font-semibold"
          )}
        >
          <Bold className="size-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Format italic"
          aria-pressed={isItalic}
          onMouseDown={(e) => {
            e.preventDefault();
            handleFormat("italic");
          }}
          className={cn(
            "size-7 p-0 rounded text-muted-foreground hover:text-foreground hover:bg-accent",
            isItalic && "bg-accent text-foreground font-semibold"
          )}
        >
          <Italic className="size-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Format underline"
          aria-pressed={isUnderline}
          onMouseDown={(e) => {
            e.preventDefault();
            handleFormat("underline");
          }}
          className={cn(
            "size-7 p-0 rounded text-muted-foreground hover:text-foreground hover:bg-accent",
            isUnderline && "bg-accent text-foreground font-semibold"
          )}
        >
          <Underline className="size-3.5" />
        </Button>
      </div>

      {/* Main contentEditable Editing Surface */}
      <div className="relative min-h-[180px] p-3 text-sm">
        {isEmpty && (
          <div className="absolute top-3 left-3 text-muted-foreground pointer-events-none select-none text-sm">
            What do you want to talk about?
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          role="textbox"
          aria-multiline="true"
          aria-label="Post commentary"
          onInput={handleInput}
          onKeyUp={updateFormattingState}
          onMouseUp={updateFormattingState}
          onKeyDown={handleKeyDown}
          className="min-h-[160px] outline-none text-foreground leading-relaxed whitespace-pre-wrap break-words"
        />
      </div>

      {/* Editor Footer: Keyboard shortcut tip and live character counter */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground bg-muted/10">
        <span className="hidden sm:inline">Press Ctrl+Enter to post</span>
        <span
          aria-live="polite"
          className={cn(
            "font-mono ml-auto",
            isOverLimit
              ? "text-destructive font-semibold"
              : isNearLimit
              ? "text-amber-500 font-medium"
              : "text-muted-foreground"
          )}
        >
          {charCount} / 3000
        </span>
      </div>
    </div>
  );
}
