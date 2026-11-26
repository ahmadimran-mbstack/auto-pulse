"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlatformLabel } from "@/components/app/PlatformLabel";
import { ApiClientError, startLinkedInConnection } from "@/lib/api";
import { usePublishPostNowMutation } from "@/lib/queries";

interface PublishDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  post: {
    id: string;
    topic_title: string;
    caption?: string | null;
    caption_preview?: string | null;
  } | null;
  visibility?: string;
  onPublished?: () => void;
  onPendingChange?: (pending: boolean) => void;
}

const LINKEDIN_AUTH_ERROR_CODES = new Set([
  "LINKEDIN_NOT_CONNECTED",
  "LINKEDIN_TOKEN_EXPIRED",
  "LINKEDIN_RECONNECT_REQUIRED",
]);

export function PublishDraftDialog({
  open,
  onOpenChange,
  userId,
  post,
  visibility = "Public",
  onPublished,
  onPendingChange,
}: PublishDraftDialogProps) {
  const publishMutation = usePublishPostNowMutation(userId);
  React.useEffect(() => {
    onPendingChange?.(publishMutation.isPending);
  }, [publishMutation.isPending, onPendingChange]);
  const [connectPromptOpen, setConnectPromptOpen] = React.useState(false);
  const [connectMessage, setConnectMessage] = React.useState(
    "Connect your LinkedIn account to publish this draft."
  );
  const [isConnecting, setIsConnecting] = React.useState(false);

  const previewText = (post?.caption || post?.caption_preview || "").trim();

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!post) return;

    try {
      await publishMutation.mutateAsync(post.id);
      toast.success("Published to LinkedIn.");
      onOpenChange(false);
      onPublished?.();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && LINKEDIN_AUTH_ERROR_CODES.has(err.code)) {
        onOpenChange(false);
        setConnectMessage(err.message);
        setConnectPromptOpen(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to publish post.");
    }
  };

  const handleConnectLinkedIn = async () => {
    setIsConnecting(true);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "linkedin_oauth_return_url",
          `${window.location.pathname}${window.location.search}`
        );
      }
      const res = await startLinkedInConnection();
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        throw new Error("Could not obtain LinkedIn authorization URL.");
      }
    } catch (err) {
      setIsConnecting(false);
      toast.error(
        err instanceof Error ? err.message : "Could not start LinkedIn connection."
      );
    }
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span>Publish to</span>
              <PlatformLabel platform="linkedin" size="sm" />
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the post text and visibility before publishing immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">LinkedIn visibility</span>
              <Badge variant="secondary" className="font-medium">
                {visibility}
              </Badge>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap break-words">
              {previewText || post?.topic_title || "No post text available."}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={publishMutation.isPending}
              className="gap-1.5"
            >
              {publishMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  <span>Post now</span>
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={connectPromptOpen} onOpenChange={setConnectPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>Connect</span>
              <PlatformLabel platform="linkedin" size="sm" />
            </DialogTitle>
            <DialogDescription>{connectMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConnectPromptOpen(false)}
              disabled={isConnecting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConnectLinkedIn}
              disabled={isConnecting}
              className="gap-1.5"
            >
              {isConnecting && <Loader2 className="size-4 animate-spin" />}
              <span>Connect LinkedIn</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
