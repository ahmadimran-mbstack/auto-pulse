"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ImagePlus,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton, ErrorState, RelativeTime } from "@/components/admin/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AuthenticatedSupportImage,
  formatSupportDate,
  SUPPORT_CATEGORY_LABELS,
  SupportPriorityBadge,
  SupportStatusBadge,
} from "@/components/support/support-badges";
import { ApiClientError, getMySupportTicket, replyMySupportTicket } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SupportStatus } from "@/types/support";

const MAX_BYTES = 5 * 1024 * 1024;
const CONTAINER_CLASS =
  "px-4 sm:px-6 lg:px-8 py-6 max-w-[1100px] mx-auto space-y-6 w-full min-w-0 overflow-x-hidden";

function StatusTimeline({
  status,
  createdAt,
  resolvedAt,
}: {
  status: SupportStatus;
  createdAt?: string | null;
  resolvedAt?: string | null;
}) {
  const isInProgressOrDone = status === "in_progress" || status === "resolved";
  const isResolved = status === "resolved";

  const steps = [
    {
      key: "created",
      label: "Created",
      detail: createdAt ? formatSupportDate(createdAt) : null,
      done: true,
      active: status === "open",
    },
    {
      key: "in_progress",
      label: "In progress",
      detail: isInProgressOrDone ? "Being reviewed" : null,
      done: isResolved,
      active: status === "in_progress",
    },
    {
      key: "resolved",
      label: "Resolved",
      detail: isResolved && resolvedAt ? formatSupportDate(resolvedAt) : null,
      done: isResolved,
      active: isResolved,
    },
  ];

  return (
    <div className="space-y-0">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  step.done
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : step.active
                      ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                      : "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                {step.done ? (
                  <Check className="size-3" strokeWidth={2.25} aria-hidden="true" />
                ) : step.active ? (
                  <Clock className="size-3" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Circle className="size-2.5" aria-hidden="true" />
                )}
              </div>
              {!isLast && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "my-1 w-px flex-1 min-h-4",
                    step.done ? "bg-emerald-500/35" : "bg-border"
                  )}
                />
              )}
            </div>
            <div className={cn("min-w-0", !isLast && "pb-3")}>
              <p
                className={cn(
                  "text-xs font-medium leading-5",
                  step.done || step.active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.detail && (
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function UserSupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id || "";
  const queryClient = useQueryClient();

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      <div className={CONTAINER_CLASS}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="order-2 lg:order-1 lg:col-span-2 space-y-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <Skeleton className="order-1 lg:order-2 h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.ticket) {
    return (
      <div className={CONTAINER_CLASS}>
        <Link
          href="/app/support"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to support
        </Link>
        <ErrorState
          title="Support ticket not found"
          message="We could not load this support ticket right now."
          onRetry={() => detailQuery.refetch()}
        />
      </div>
    );
  }

  const { ticket, messages } = detailQuery.data;
  const visibleMessages = messages.filter((m) => !m.is_internal);

  return (
    <div className={CONTAINER_CLASS}>
      <div className="space-y-3">
        <Link
          href="/app/support"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to support
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight break-words">
              {ticket.subject}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">#{ticket.id.slice(0, 8).toUpperCase()}</span>
              <span>•</span>
              <span>Opened {formatSupportDate(ticket.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Sticky info card: top on mobile, right column on desktop */}
        <Card className="order-1 lg:order-2 lg:sticky lg:top-20">
          <CardHeader className="pb-3 border-b border-border/70">
            <CardTitle className="text-sm font-semibold">Ticket details</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-y-3 gap-x-2 items-center">
              <span className="text-muted-foreground">Status</span>
              <div className="flex justify-end">
                <SupportStatusBadge status={ticket.status} />
              </div>

              <span className="text-muted-foreground">Priority</span>
              <div className="flex justify-end">
                <SupportPriorityBadge priority={ticket.priority} />
              </div>

              <span className="text-muted-foreground">Category</span>
              <div className="flex justify-end">
                <Badge variant="outline" className="text-[11px] font-normal">
                  {SUPPORT_CATEGORY_LABELS[ticket.category] || ticket.category}
                </Badge>
              </div>

              <span className="text-muted-foreground">Created</span>
              <span className="text-right font-medium text-foreground">
                {formatSupportDate(ticket.created_at)}
              </span>

              <span className="text-muted-foreground">Ticket ID</span>
              <span className="inline-flex items-center justify-end gap-1 font-mono text-foreground">
                #{ticket.id.slice(0, 8).toUpperCase()}
                <CopyButton
                  value={ticket.id}
                  label={`Copy ticket ID ${ticket.id}`}
                  toastLabel="Ticket ID copied"
                />
              </span>
            </div>

            <div className="pt-3 border-t border-border/70 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Status timeline</p>
              <StatusTimeline
                status={ticket.status}
                createdAt={ticket.created_at}
                resolvedAt={ticket.resolved_at}
              />
            </div>
          </CardContent>
        </Card>

        {/* Thread column: below info card on mobile, left 2 columns on desktop */}
        <div className="order-2 lg:order-1 lg:col-span-2 flex flex-col gap-4 min-w-0">
          {ticket.status === "resolved" && (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <AlertDescription className="text-xs font-medium">
                Marked as resolved. Send a reply to reopen it.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {visibleMessages.map((m) => {
              const isSupport = m.author_type === "admin";
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-end gap-2.5",
                    isSupport ? "justify-start" : "justify-end"
                  )}
                >
                  {isSupport && (
                    <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card overflow-hidden p-1 mb-5">
                      <Image
                        src="/logo-mark-blue-bg.png"
                        alt="AutoPulse Support"
                        width={24}
                        height={24}
                        className="hidden h-full w-full object-contain rounded-full dark:block"
                      />
                      <Image
                        src="/logo-mark-white-bg.png"
                        alt="AutoPulse Support"
                        width={24}
                        height={24}
                        className="block h-full w-full object-contain rounded-full dark:hidden"
                      />
                    </div>
                  )}

                  <div
                    className={cn(
                      "flex flex-col max-w-[85%] sm:max-w-[78%] min-w-0",
                      isSupport ? "items-start" : "items-end"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words shadow-xs",
                        isSupport
                          ? "rounded-bl-sm border border-border bg-card text-card-foreground"
                          : "rounded-br-sm bg-primary text-primary-foreground"
                      )}
                    >
                      {isSupport && (
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">
                          AutoPulse Support
                        </p>
                      )}
                      <div>{m.body}</div>
                      {m.has_attachment && m.attachment_url && (
                        <div className="mt-2">
                          <AuthenticatedSupportImage path={m.attachment_url} />
                        </div>
                      )}
                    </div>
                    <div className="mt-1 px-1 text-[11px] text-muted-foreground">
                      <RelativeTime iso={m.created_at} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply composer fixed at the bottom of the thread */}
          <Card className="sticky bottom-4 z-10 border-border bg-card/95 backdrop-blur-xs shadow-sm">
            <CardContent className="p-4">
              <form onSubmit={handleReplySubmit} className="space-y-3">
                <Textarea
                  id="reply-body"
                  rows={3}
                  maxLength={5000}
                  placeholder="Write a reply..."
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className="resize-none"
                  required
                />

                {attachment && (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="inline-flex items-center gap-1 text-foreground hover:text-destructive shrink-0"
                      aria-label="Remove attachment"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}

                {replyError && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">{replyError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      id="reply-file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={replyMutation.isPending}
                    >
                      <ImagePlus className="size-4 mr-1.5" />
                      Attach image
                    </Button>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {replyBody.length}/5000
                    </span>
                  </div>

                  <Button type="submit" size="sm" disabled={replyMutation.isPending}>
                    {replyMutation.isPending ? (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="size-4 mr-1.5" />
                    )}
                    Send
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
