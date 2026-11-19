"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardPasteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone, type ActiveUploadItem } from "@/components/app/FileDropzone";
import { Section } from "@/components/app/Section";
import { pastePostsSchema, type PastePostsValues } from "@/lib/customization-schemas";
import { DocumentRow } from "./DocumentRow";
import type { DocumentSummary } from "@/types/customization";

interface PreviousPostsSectionProps {
  docs: DocumentSummary[];
  samplesCount: number;
  useForVoice: boolean;
  onUseForVoiceChange: (val: boolean) => void;
  onUpload: (files: File[]) => void;
  onPaste: (values: PastePostsValues) => Promise<void>;
  onToggleEnabled: (doc: DocumentSummary, enabled: boolean) => void;
  onInspect: (doc: DocumentSummary) => void;
  onReprocess: (doc: DocumentSummary) => void;
  onDelete: (doc: DocumentSummary) => void;
  isUploading: boolean;
  activeUploads?: ActiveUploadItem[];
}

export function PreviousPostsSection({
  docs,
  samplesCount,
  useForVoice,
  onUseForVoiceChange,
  onUpload,
  onPaste,
  onToggleEnabled,
  onInspect,
  onReprocess,
  onDelete,
  isUploading,
  activeUploads,
}: PreviousPostsSectionProps) {
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const form = useForm<PastePostsValues>({
    resolver: zodResolver(pastePostsSchema),
    defaultValues: { title: "My LinkedIn posts", text: "" },
  });

  const handlePasteSubmit = form.handleSubmit(async (values) => {
    await onPaste(values);
    form.reset({ title: "My LinkedIn posts", text: "" });
    setPasteOpen(false);
  });

  return (
    <div className="space-y-6">
      <Section
        title="Previous LinkedIn posts"
        description="Upload or paste posts you have written. AutoPulse learns your rhythm, vocabulary, and hook style without copying your sentences."
        actions={
          <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ClipboardPasteIcon className="size-4 mr-1.5" />
                Paste posts
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Paste previous posts</DialogTitle>
                <DialogDescription>
                  Separate multiple posts with <code className="text-xs bg-muted px-1 py-0.5 rounded">---</code> on its own line.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handlePasteSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="paste-title">Title</Label>
                  <Input id="paste-title" {...form.register("title")} />
                  {form.formState.errors.title && (
                    <p className="text-xs text-status-danger-fg">{form.formState.errors.title.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paste-text">Posts</Label>
                  <Textarea
                    id="paste-text"
                    rows={10}
                    placeholder={"First post...\n\n---\n\nSecond post..."}
                    {...form.register("text")}
                  />
                  {form.formState.errors.text && (
                    <p className="text-xs text-status-danger-fg">{form.formState.errors.text.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setPasteOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    Save posts
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge variant={samplesCount >= 5 ? "success" : "warning"} className="tabular-nums">
                {samplesCount} post{samplesCount === 1 ? "" : "s"} detected
              </Badge>
              <span className="text-xs text-muted-foreground">
                5+ recommended for voice learning
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="use-voice" className="text-xs text-muted-foreground">
                Learn voice from posts
              </Label>
              <Switch
                id="use-voice"
                checked={useForVoice}
                onCheckedChange={onUseForVoiceChange}
              />
            </div>
          </div>

          <FileDropzone
            onFilesSelected={onUpload}
            disabled={isUploading}
            activeUploads={activeUploads}
            label="Drop a file of your previous posts or click to upload"
            hint="PDF, DOCX, MD, or TXT · Max 10 MB · Click any uploaded item to pin or exclude individual posts"
          />

          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
              No previous posts added yet.
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
