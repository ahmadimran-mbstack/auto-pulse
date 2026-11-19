"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FileDropzone, type ActiveUploadItem } from "@/components/app/FileDropzone";
import { Section } from "@/components/app/Section";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DocumentRow } from "./DocumentRow";
import type { DocumentSummary } from "@/types/customization";

interface PlaybooksSectionProps {
  docs: DocumentSummary[];
  mode: "merge" | "replace";
  onModeChange: (mode: "merge" | "replace") => void;
  onUpload: (files: File[]) => void;
  onToggleEnabled: (doc: DocumentSummary, enabled: boolean) => void;
  onInspect: (doc: DocumentSummary) => void;
  onReprocess: (doc: DocumentSummary) => void;
  onDelete: (doc: DocumentSummary) => void;
  isUploading: boolean;
  activeUploads?: ActiveUploadItem[];
}

export function PlaybooksSection({
  docs,
  mode,
  onModeChange,
  onUpload,
  onToggleEnabled,
  onInspect,
  onReprocess,
  onDelete,
  isUploading,
  activeUploads,
}: PlaybooksSectionProps) {
  return (
    <div className="space-y-6">
      <Section
        title="LinkedIn playbooks"
        description="Upload your hooks, structure rules, CTAs, and formatting guidelines in PDF, DOCX, Markdown, or TXT."
      >
        <div className="space-y-4">
          <FileDropzone
            onFilesSelected={onUpload}
            disabled={isUploading}
            activeUploads={activeUploads}
            label="Drop your LinkedIn playbook here or click to upload"
            hint="PDF, DOCX, MD, or TXT · Max 10 MB · Up to 5 playbooks"
          />

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Default playbook interaction</p>
            <RadioGroup
              value={mode}
              onValueChange={(val) => onModeChange(val as "merge" | "replace")}
              className="grid gap-3 sm:grid-cols-2"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onModeChange("merge")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onModeChange("merge");
                  }
                }}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  mode === "merge"
                    ? "border-primary bg-signal-soft/30"
                    : "border-border hover:bg-muted/30"
                )}
              >
                <RadioGroupItem value="merge" id="pb-merge" className="mt-0.5 pointer-events-none" />
                <div className="space-y-1">
                  <Label htmlFor="pb-merge" className="font-medium cursor-pointer pointer-events-none">
                    Merge with AutoPulse defaults
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Your rules take priority; non-conflicting AutoPulse best practices still apply.
                  </p>
                </div>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onModeChange("replace")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onModeChange("replace");
                  }
                }}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  mode === "replace"
                    ? "border-primary bg-signal-soft/30"
                    : "border-border hover:bg-muted/30"
                )}
              >
                <RadioGroupItem value="replace" id="pb-replace" className="mt-0.5 pointer-events-none" />
                <div className="space-y-1">
                  <Label htmlFor="pb-replace" className="font-medium cursor-pointer pointer-events-none">
                    Replace default style rules
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Use only your playbook rules (fact-grounding and safety rules still apply).
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
              No playbooks uploaded yet. Playbooks teach AutoPulse your hook formulas, structure, and CTAs.
            </p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  onToggleEnabled={onToggleEnabled}
                  onInspect={onInspect}
                  onReprocess={onReprocess}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
