"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Image as ImageIcon,
  Loader2,
  Trash2,
  RefreshCw,
  ExternalLink,
  Globe,
  Users,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichPostEditor } from "./components/RichPostEditor";
import { AgentPlayground } from "./components/AgentPlayground";
import { PlatformLabel } from "@/components/app/PlatformLabel";
import {
  useLinkedInStatusQuery,
  usePostToLinkedInMutation,
} from "@/lib/queries";
import { startLinkedInConnection } from "@/lib/api";
import { ApiClientError } from "@/lib/api";
import type { LinkedInPostResponse } from "@/types/connections";
import { cn } from "@/lib/utils";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface PlaygroundClientProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
}

export function PlaygroundClient({ user }: PlaygroundClientProps) {
  const searchParams = useSearchParams();

  // Queries and mutations
  const {
    data: statusData,
    isLoading: isStatusLoading,
    refetch: refetchStatus,
  } = useLinkedInStatusQuery(user.id);
  const postMutation = usePostToLinkedInMutation(user.id);

  // Form states initialized lazily from sessionStorage draft if available
  const [contentHtml, setContentHtml] = React.useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const saved = sessionStorage.getItem("linkedin_playground_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.content || "";
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
    return "";
  });

  const [plainText, setPlainText] = React.useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const saved = sessionStorage.getItem("linkedin_playground_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.plainText || parsed.content || "";
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
    return "";
  });

  const [visibility, setVisibility] = React.useState<"PUBLIC" | "CONNECTIONS">(() => {
    if (typeof window === "undefined") return "PUBLIC";
    try {
      const saved = sessionStorage.getItem("linkedin_playground_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.visibility === "PUBLIC" || parsed.visibility === "CONNECTIONS") {
          return parsed.visibility;
        }
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
    return "PUBLIC";
  });

  const [activeTab, setActiveTab] = React.useState<"agents" | "composer">("agents");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // Modal and dialog controls
  const [showConnectDialog, setShowConnectDialog] = React.useState(false);
  const [showClearDialog, setShowClearDialog] = React.useState(false);
  const [isStartingOAuth, setIsStartingOAuth] = React.useState(false);
  const [publishedPost, setPublishedPost] = React.useState<LinkedInPostResponse | null>(null);
  const [draftMeta, setDraftMeta] = React.useState<{
    topic_title?: string;
    angle?: string;
    ai_score?: number;
    image_headline?: string;
    sources?: any[];
  } | null>(null);

  const queryClient = useQueryClient();

  const handleUseInComposer = (text: string, meta?: any) => {
    setPlainText(text);
    const htmlFormatted = `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`;
    setContentHtml(htmlFormatted);
    if (meta) {
      setDraftMeta(meta);
    }
    setActiveTab("composer");
    toast.success("Draft transferred to LinkedIn composer");
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Clean up object URLs on component unmount or image replacement
  React.useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Primary publish routine
  const handlePublish = React.useCallback(
    async (
      overrideContent?: string,
      overrideVisibility?: "PUBLIC" | "CONNECTIONS",
      skipConnectionCheck = false
    ) => {
      const textToSubmit = overrideContent !== undefined ? overrideContent : contentHtml;
      const currentVis = overrideVisibility !== undefined ? overrideVisibility : visibility;

      if (!textToSubmit || !textToSubmit.trim()) {
        toast.error("Please enter post content before publishing.");
        return;
      }

      if (plainText.length > 3000) {
        toast.error("Post content exceeds LinkedIn 3000 character limit.");
        return;
      }

      // Check if user is connected unless we are retrying after an OAuth return
      if (!skipConnectionCheck && !statusData?.connected) {
        setShowConnectDialog(true);
        return;
      }

      const formData = new FormData();
      formData.append("content", textToSubmit);
      formData.append("visibility", currentVis);
      if (imageFile) {
        formData.append("image", imageFile);
      }
      if (draftMeta?.topic_title) {
        formData.append("topic_title", draftMeta.topic_title);
      }
      if (draftMeta?.angle) {
        formData.append("angle", draftMeta.angle);
      }
      if (draftMeta?.ai_score !== undefined && draftMeta?.ai_score !== null) {
        formData.append("ai_score", String(draftMeta.ai_score));
      }
      if (draftMeta?.image_headline) {
        formData.append("image_headline", draftMeta.image_headline);
      }
      if (draftMeta?.sources && draftMeta.sources.length > 0) {
        formData.append("sources_json", JSON.stringify(draftMeta.sources));
      }

      try {
        const response = await postMutation.mutateAsync(formData);
        setPublishedPost(response);
        // Refresh posts and dashboard cache so published post displays immediately
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success("Post published to LinkedIn successfully!");

        // Clean up local draft in sessionStorage
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("linkedin_playground_draft");
        }
      } catch (err: unknown) {
        // Even if publishing to LinkedIn was rejected by rate limits, the draft was preserved
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });

        if (err instanceof ApiClientError) {
          if (
            err.code === "LINKEDIN_NOT_CONNECTED" ||
            err.code === "LINKEDIN_TOKEN_EXPIRED" ||
            err.code === "LINKEDIN_RECONNECT_REQUIRED"
          ) {
            setShowConnectDialog(true);
            return;
          }

          toast.error(err.message || "Failed to publish post to LinkedIn.", {
            duration: 10000,
          });
        } else if (err instanceof Error) {
          toast.error(err.message, { duration: 10000 });
        } else {
          toast.error("An unexpected error occurred while posting.", { duration: 10000 });
        }
      }
    },
    [contentHtml, visibility, plainText, statusData?.connected, imageFile, draftMeta, postMutation, queryClient]
  );

  // Handle OAuth return redirect and draft auto-publishing
  React.useEffect(() => {
    const isConnectedParam = searchParams.get("connected") === "linkedin";
    if (typeof window === "undefined" || !isConnectedParam) return;

    // Toast connection confirmation
    toast.success("LinkedIn connected successfully!");
    refetchStatus();

    // Strip the query parameter from URL cleanly without full reload
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);

    // If the draft was stored with autoPost, trigger immediate publication
    const savedDraftRaw = sessionStorage.getItem("linkedin_playground_draft");
    if (!savedDraftRaw) return;

    try {
      const savedDraft = JSON.parse(savedDraftRaw);
      if (savedDraft.autoPost && savedDraft.content) {
        sessionStorage.removeItem("linkedin_playground_draft");
        // Defer slightly to allow component rendering and token sync
        setTimeout(() => {
          handlePublish(savedDraft.content, savedDraft.visibility, true);
        }, 300);
      }
    } catch (err) {
      console.warn("Failed to process auto-publish draft:", err);
    }
  }, [searchParams, refetchStatus, handlePublish]);

  // Validates file format and size
  const handleSelectFile = (file: File) => {
    const mime = file.type.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      toast.error("Unsupported file type. Please upload a JPEG, PNG, GIF, or WebP image.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Image is too large. Maximum file size is 5 MB.");
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setImageFile(file);
    setImagePreviewUrl(preview);
  };

  const handleRemoveImage = () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Start LinkedIn OAuth flow from modal
  const handleStartOAuth = async () => {
    setIsStartingOAuth(true);
    try {
      // Save current draft state to sessionStorage so it survives the OAuth redirect
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "linkedin_playground_draft",
          JSON.stringify({
            content: contentHtml,
            plainText,
            visibility,
            autoPost: true,
          })
        );
        sessionStorage.setItem("linkedin_oauth_return_url", "/app/playground");
      }

      const res = await startLinkedInConnection();
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        throw new Error("Unable to obtain LinkedIn authorization URL.");
      }
    } catch (err) {
      setIsStartingOAuth(false);
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not start LinkedIn connection. Please try again."
      );
    }
  };

  // Reset form to blank defaults
  const handleConfirmClear = () => {
    setContentHtml("");
    setPlainText("");
    handleRemoveImage();
    setVisibility("PUBLIC");
    setPublishedPost(null);
    setShowClearDialog(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("linkedin_playground_draft");
    }
  };

  const isPosting = postMutation.isPending;
  const isSubmitDisabled =
    isPosting || plainText.trim().length === 0 || plainText.length > 3000;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
      {/* Page Title & Connection Status Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Playground
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Test multi-agent post generation with live trace, or draft and publish directly to LinkedIn.
          </p>
        </div>

        {/* Live LinkedIn Connection Status Pill */}
        <div>
          {isStatusLoading ? (
            <Skeleton className="h-6 w-36 rounded-full" />
          ) : statusData?.connected ? (
            <Badge
              variant="outline"
              className="gap-1.5 px-2.5 py-1 text-xs font-normal border-status-success-fg/30 bg-status-success-bg text-status-success-fg"
            >
              <span className="size-1.5 rounded-full bg-status-success-fg shrink-0" />
              <span>
                Connected
                {statusData.account_name ? `: ${statusData.account_name}` : ""}
              </span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              onClick={() => setShowConnectDialog(true)}
              className="gap-1.5 px-2.5 py-1 text-xs font-normal border-status-warning-fg/30 bg-status-warning-bg text-status-warning-fg cursor-pointer hover:bg-status-warning-bg/80 transition-colors"
            >
              <span className="size-1.5 rounded-full bg-status-warning-fg shrink-0" />
              <span>Not connected (Click to link)</span>
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "agents" | "composer")} className="w-full flex flex-col gap-4">
        <TabsList className="grid w-full grid-cols-2 max-w-xs h-9">
          <TabsTrigger value="agents">Write with Agents</TabsTrigger>
          <TabsTrigger value="composer">LinkedIn Composer</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4">
          <AgentPlayground userId={user.id} onUseInComposer={handleUseInComposer} />
        </TabsContent>

        <TabsContent value="composer" className="space-y-6 mt-4">
          {/* Success banner shown after publishing */}
          {publishedPost && (
        <Card className="border border-status-success-fg/30 bg-status-success-bg/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 text-status-success-fg shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
                  <span>Published to</span>
                  <PlatformLabel platform="linkedin" size="sm" />
                </p>
                <p className="text-xs text-muted-foreground">
                  Your post was shared with {publishedPost.visibility.toLowerCase()} visibility.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                asChild
                className="h-8 gap-1.5 text-xs font-medium shadow-xs"
              >
                <Link href={publishedPost.post_id ? `/app/posts/${publishedPost.post_id}` : "/app/posts"}>
                  <span>View in Dashboard</span>
                  <ExternalLink className="size-3" />
                </Link>
              </Button>
              {publishedPost.linkedin_post_id && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-8 gap-1.5 text-xs bg-background"
                >
                  <a
                    href={`https://www.linkedin.com/feed/update/${encodeURIComponent(
                      publishedPost.linkedin_post_id
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>View on LinkedIn</span>
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPublishedPost(null)}
                className="h-8 text-xs text-muted-foreground"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Main Composer Card */}
      <Card className="border border-card-border bg-card rounded-lg overflow-hidden">
        <CardContent className="p-4 sm:p-6 space-y-6">
          {/* 1. Optional Image Area */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Attachment (Optional)
            </Label>

            {imagePreviewUrl ? (
              <div className="relative group rounded-lg overflow-hidden border border-border bg-muted/20">
                <div className="relative w-full h-48 sm:h-64">
                  <Image
                    src={imagePreviewUrl}
                    alt="Post attachment preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>

                {/* Floating controls on top of image */}
                <div className="absolute top-3 right-3 flex items-center gap-2 bg-background/80 backdrop-blur-sm p-1.5 rounded-md border border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 px-2 text-xs gap-1.5 text-foreground hover:bg-accent"
                  >
                    <RefreshCw className="size-3.5" />
                    <span>Replace</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveImage}
                    className="h-7 px-2 text-xs gap-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Remove</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) handleSelectFile(dropped);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center h-44 rounded-lg border-2 border-dashed border-border bg-muted/10 p-6 text-center cursor-pointer transition-colors",
                  "hover:border-foreground/30 hover:bg-muted/20",
                  isDragging && "border-primary bg-primary/5"
                )}
              >
                <div className="size-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground mb-2">
                  <ImageIcon className="size-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Click or drag image to attach
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPEG, PNG, GIF, or WebP up to 5 MB
                </p>
              </div>
            )}

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) handleSelectFile(selected);
              }}
              className="hidden"
            />
          </div>

          {/* 2. Rich Text Content Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Post Content
              </Label>
              <span className="text-xs text-muted-foreground">
                Bold, Italic, and Underline supported
              </span>
            </div>

            <RichPostEditor
              value={contentHtml}
              onChange={(html, text) => {
                setContentHtml(html);
                setPlainText(text);
              }}
              onSubmitShortcut={() => {
                if (!isSubmitDisabled) {
                  handlePublish();
                }
              }}
              disabled={isPosting}
            />
          </div>

          {/* 3. Post Visibility Selector */}
          <div className="space-y-3 pt-2 border-t border-border">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Who can see this post?
            </Label>

            <RadioGroup
              value={visibility}
              onValueChange={(val) => setVisibility(val as "PUBLIC" | "CONNECTIONS")}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {/* Option 1: Anyone (PUBLIC) */}
              <label
                htmlFor="vis-anyone"
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all",
                  visibility === "PUBLIC"
                    ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
              >
                <RadioGroupItem value="PUBLIC" id="vis-anyone" className="mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Globe className="size-4" />
                    <span>Anyone</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Visible to anyone on or off LinkedIn
                  </p>
                </div>
              </label>

              {/* Option 2: Connections Only (CONNECTIONS) */}
              <label
                htmlFor="vis-connections"
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all",
                  visibility === "CONNECTIONS"
                    ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
              >
                <RadioGroupItem
                  value="CONNECTIONS"
                  id="vis-connections"
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Users className="size-4" />
                    <span>Connections only</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Visible only to your LinkedIn network
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* 4. Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (plainText.trim() || imageFile) {
                  setShowClearDialog(true);
                } else {
                  handleConfirmClear();
                }
              }}
              disabled={isPosting || (!plainText.trim() && !imageFile)}
              className="w-full sm:w-auto text-muted-foreground hover:text-foreground"
            >
              Clear draft
            </Button>

            <Button
              type="button"
              onClick={() => handlePublish()}
              disabled={isSubmitDisabled}
              className="w-full sm:w-auto h-10 px-6 font-medium text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
            >
              {isPosting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Posting...
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span>Post to</span>
                  <PlatformLabel platform="linkedin" size="sm" textClassName="text-primary-foreground" />
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      </TabsContent>
      </Tabs>

      {/* Connect LinkedIn Modal Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-1.5">
              <span>Connect your</span>
              <PlatformLabel platform="linkedin" size="sm" />
              <span>account</span>
            </DialogTitle>
            <DialogDescription>
              To publish posts directly from AutoPulse, please connect your LinkedIn account. Your draft will be saved and published automatically as soon as the connection completes.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowConnectDialog(false)}
              disabled={isStartingOAuth}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStartOAuth}
              disabled={isStartingOAuth}
              className="inline-flex items-center gap-1.5"
            >
              {isStartingOAuth ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  <span>Connect</span>
                  <PlatformLabel platform="linkedin" size="sm" textClassName="text-primary-foreground" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Clear Modal Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear post draft?</DialogTitle>
            <DialogDescription>
              This will remove your written content and attached image. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowClearDialog(false)}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmClear}
            >
              Clear post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
