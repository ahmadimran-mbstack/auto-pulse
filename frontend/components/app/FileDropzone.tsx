"use client";

import * as React from "react";
import { LoaderCircle, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateCustomizationFile } from "@/lib/customization-schemas";
import { StageProgress } from "@/components/app/ProgressBars";

export interface ActiveUploadItem {
  id: string;
  name: string;
  progress: number;
}

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  activeUploads?: ActiveUploadItem[];
  label?: string;
  hint?: string;
  className?: string;
}

export function FileDropzone({
  onFilesSelected,
  accept = ".pdf,.docx,.md,.markdown,.txt",
  multiple = true,
  disabled = false,
  activeUploads = [],
  label = "Drop files here or click to browse",
  hint = "Accepted: PDF, DOCX, MD, TXT · Max 10 MB per file",
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
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors duration-150 motion-reduce:transition-none cursor-pointer",
          dragging
            ? "border-primary bg-muted/60"
            : "border-border bg-card hover:border-foreground/30 hover:bg-muted/30",
          disabled && "opacity-75 cursor-not-allowed pointer-events-none"
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
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground">
          {activeUploads.length > 0 ? (
            <LoaderCircle className="size-4 stroke-[1.75] text-status-info-fg animate-spin motion-reduce:animate-none" />
          ) : (
            <UploadCloud className="size-4 stroke-[1.75] text-foreground" />
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </label>

      {activeUploads.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          {activeUploads.map((item) => (
            <div key={item.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium text-foreground">{item.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {item.progress < 100 ? `Uploading ${item.progress}%` : "Starting analysis..."}
                </span>
              </div>
              <StageProgress stageIndex={item.progress < 100 ? 1 : 2} />
            </div>
          ))}
        </div>
      )}

      {clientError && (
        <p className="text-xs text-status-danger-fg" role="alert">
          {clientError}
        </p>
      )}
    </div>
  );
}
