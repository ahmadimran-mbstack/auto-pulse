"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AuthenticatedSupportImage,
  formatSupportDate,
  SUPPORT_CATEGORY_LABELS,
  SupportPriorityBadge,
  SupportStatusBadge,
} from "@/components/support/support-badges";
import { ApiClientError, getMySupportTicket, replyMySupportTicket } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;

export default function UserSupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id || "";
  const queryClient = useQueryClient();

  const [replyBody, setReplyBody] = React.useState("");
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [replyError, setReplyError] = React.useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["my-support-ticket", ticketId],
    queryFn: () => getMySupportTicket(ticketId),
    enabled: Boolean(ticketId),
  });

  const replyMutation = useMutation({
    mutationFn: (payload: { body: string; attachment?: File | null }) =>
      replyMySupportTicket(ticketId, payload),
    onSuccess: (res) => {
      toast.success(res.reopened ? "Reply sent and ticket reopened" : "Reply sent");
      setReplyBody("");
      setAttachment(null);
      setReplyError(null);
      queryClient.invalidateQueries({ queryKey: ["my-support-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Could not send your reply.";
      setReplyError(msg);
      toast.error(msg);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setReplyError(null);
    if (!f) {
      setAttachment(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setReplyError("Screenshot must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setReplyError("Only PNG, JPG, or WebP images are allowed.");
      e.target.value = "";
      return;
    }
    setAttachment(f);
  }

  function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    setReplyError(null);
    if (!replyBody.trim() || replyBody.trim().length > 5000) {
      setReplyError("Reply is required and must be 5,000 characters or fewer.");
      return;
    }
    replyMutation.mutate({ body: replyBody.trim(), attachment });
  }

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
        <div className="h-40 rounded-lg border border-border bg-card animate-pulse" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.ticket) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/support"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to support
        </Link>
        <Alert variant="destructive">
          <AlertDescription>Support ticket not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { ticket, messages } = detailQuery.data;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/app/support"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="size-4" />
          Back to support
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{ticket.subject}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {SUPPORT_CATEGORY_LABELS[ticket.category] || ticket.category} • Opened{" "}
              {formatSupportDate(ticket.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SupportPriorityBadge priority={ticket.priority} />
            <SupportStatusBadge status={ticket.status} />
          </div>
        </div>
      </div>

      {ticket.status === "resolved" && (
        <Alert>
          <AlertDescription className="text-xs">
            This ticket is marked resolved. Sending a reply below will reopen it automatically.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {messages.map((m) => (
          <Card
            key={m.id}
            className={m.author_type === "admin" ? "border-sky-500/30 bg-sky-500/5" : ""}
          >
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {m.author_type === "admin" ? "AutoPulse Support" : "You"}
                </span>
                <span className="text-muted-foreground">{formatSupportDate(m.created_at)}</span>
              </div>
            </CardHeader>
            <CardContent className="py-3.5 px-4 text-sm whitespace-pre-wrap break-words">
              {m.body}
              {m.has_attachment && m.attachment_url && (
                <div>
                  <AuthenticatedSupportImage path={m.attachment_url} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Send a reply</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReplySubmit} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="reply-body">Message</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {replyBody.length}/5000
                </span>
              </div>
              <Textarea
                id="reply-body"
                rows={4}
                maxLength={5000}
                placeholder="Write a follow-up message..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reply-file">Screenshot (optional, PNG/JPG/WebP, max 5 MB)</Label>
              <Input
                id="reply-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
              />
            </div>

            {replyError && (
              <Alert variant="destructive">
                <AlertDescription>{replyError}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={replyMutation.isPending}>
              {replyMutation.isPending ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Send className="size-4 mr-2" />
              )}
              Send reply
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
