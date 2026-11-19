"use client";

import * as React from "react";
import { UploadCloudIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateCustomizationFile } from "@/lib/customization-schemas";

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
  className?: string;
}

export function FileDropzone({
  onFilesSelected,
  accept = ".pdf,.docx,.md,.markdown,.txt",
  multiple = true,
  disabled = false,
  label = "Drop files here or click to browse",
  hint = "PDF, DOCX, Markdown, or TXT · Max 10 MB per file",
  className,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [clientError, setClientError] = React.useState<string | null>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || disabled) return;
    setClientError(null);
    const valid: File[] = [];
    for (const file of Array.from(fileList)) {
      const err = validateCustomizationFile(file);
      if (err) {
        setClientError(`${file.name}: ${err}`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) {
      onFilesSelected(valid);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
          dragging
            ? "border-primary bg-signal-soft/50"
            : "border-input bg-card hover:border-primary/60 hover:bg-muted/30",
          disabled && "opacity-60 cursor-not-allowed pointer-events-none"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-foreground">
          <UploadCloudIcon className="size-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </label>
      {clientError && (
        <p className="text-xs text-status-danger-fg" role="alert">
          {clientError}
        </p>
      )}
    </div>
  );
}
