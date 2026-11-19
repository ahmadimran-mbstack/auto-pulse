"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileDropzone } from "@/components/app/FileDropzone";
import { Section } from "@/components/app/Section";
import { urlAddSchema, type UrlAddValues } from "@/lib/customization-schemas";
import { DocumentRow } from "./DocumentRow";
import type { DocumentSummary } from "@/types/customization";

interface BusinessSectionProps {
  docs: DocumentSummary[];
  businessMention: "never" | "natural" | "often";
  onBusinessMentionChange: (val: "never" | "natural" | "often") => void;
  onAddUrl: (values: UrlAddValues) => Promise<void>;
  onUpload: (files: File[]) => void;
  onToggleEnabled: (doc: DocumentSummary, enabled: boolean) => void;
  onInspect: (doc: DocumentSummary) => void;
  onReprocess: (doc: DocumentSummary) => void;
  onDelete: (doc: DocumentSummary) => void;
  isUploading: boolean;
}

export function BusinessSection({
  docs,
  businessMention,
  onBusinessMentionChange,
  onAddUrl,
  onUpload,
  onToggleEnabled,
  onInspect,
  onReprocess,
  onDelete,
  isUploading,
}: BusinessSectionProps) {
  const form = useForm<UrlAddValues>({
    resolver: zodResolver(urlAddSchema),
    defaultValues: { url: "", title: "" },
  });

  const urlDocs = docs.filter((d) => d.source_type === "url");
  const fileDocs = docs.filter((d) => d.source_type !== "url");

  const handleUrlSubmit = form.handleSubmit(async (values) => {
    await onAddUrl(values);
    form.reset();
  });

  return (
    <div className="space-y-6">
      <Section
        title="Business URLs"
        description="Add your website, product pages, or about page. AutoPulse extracts verified facts and terminology."
      >
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="biz-url">Website URL</Label>
              <Input
                id="biz-url"
                placeholder="https://yourcompany.com/about"
                {...form.register("url")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-url-title">Label (optional)</Label>
              <Input
                id="biz-url-title"
                placeholder="Product page"
                {...form.register("title")}
              />
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <PlusIcon className="size-4 mr-1.5" />
              Add URL
            </Button>
          </div>
          {form.formState.errors.url && (
            <p className="text-xs text-status-danger-fg">{form.formState.errors.url.message}</p>
          )}
        </form>

        {urlDocs.length > 0 && (
          <div className="mt-4 space-y-2">
            {urlDocs.map((doc) => (
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
      </Section>

      <Section
        title="Business documents"
        description="Upload pitch decks (exported to PDF), one-pagers, case studies, or product docs."
      >
        <div className="space-y-4">
          <FileDropzone
            onFilesSelected={onUpload}
            disabled={isUploading}
            label="Drop business documents here or click to upload"
            hint="PDF, DOCX, MD, or TXT · Max 10 MB · Up to 20 documents"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-card p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Business mention frequency</p>
              <p className="text-xs text-muted-foreground">
                Controls how often the agent references your product or company in posts.
              </p>
            </div>
            <Select value={businessMention} onValueChange={(v) => onBusinessMentionChange(v as "never" | "natural" | "often")}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="natural">Natural fit (default)</SelectItem>
                <SelectItem value="often">Mention often</SelectItem>
                <SelectItem value="never">Background only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {fileDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
              No business documents uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {fileDocs.map((doc) => (
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
