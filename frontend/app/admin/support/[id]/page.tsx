"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Lock, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import {
  CopyButton,
  ErrorState,
  RelativeTime,
  StatusBadge,
  UserAvatar,
} from "@/components/admin/shared";
import {
  AuthenticatedSupportImage,
  SUPPORT_CATEGORY_LABELS,
} from "@/components/support/support-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiClientError,
  getAdminSupportTicket,
  replyAdminSupportTicket,
  updateAdminSupportTicketStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SupportStatus } from "@/types/support";

export default function AdminSupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id || "";
  const queryClient = useQueryClient();

  const [replyBody, setReplyBody] = React.useState("");
  const [isInternal, setIsInternal] = React.useState(false);
  const [statusOverride, setStatusOverride] = React.useState<SupportStatus | null>(null);
  const [sendStatusEmail, setSendStatusEmail] = React.useState(true);

  const detailQuery = useQuery({
    queryKey: ["admin-support-ticket", ticketId],
    queryFn: () => getAdminSupportTicket(ticketId),
    enabled: Boolean(ticketId),
  });

  const selectedStatus = statusOverride ?? detailQuery.data?.ticket?.status ?? "open";

  const replyMutation = useMutation({
    mutationFn: (payload: { body: string; is_internal: boolean }) =>
      replyAdminSupportTicket(ticketId, payload),
    onSuccess: (res, vars) => {
      toast.success(vars.is_internal ? "Internal note added" : "Reply sent to user");
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["admin-support-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-badge-counts"] });
      if (res.email_status === "failed") {
        toast.warning("Reply saved, but notification email failed to send.");
      }
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not save reply.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { status: SupportStatus; send_email: boolean }) =>
      updateAdminSupportTicketStatus(ticketId, payload),
    onSuccess: (res) => {
      toast.success(`Status updated to ${res.ticket.status.replace("_", " ")}`);
      setStatusOverride(null);
      queryClient.invalidateQueries({ queryKey: ["admin-support-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-badge-counts"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update ticket status.");
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-80 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.ticket) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/support">
            <ArrowLeft className="size-4 mr-1.5" />
            Back to support tickets
          </Link>
        </Button>
        <ErrorState
          title="Support ticket not found"
          message="Could not load this support ticket."
          onRetry={() => detailQuery.refetch()}
        />
      </div>
    );
  }

  const { ticket, messages, email_logs } = detailQuery.data;

  function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    replyMutation.mutate({ body: replyBody.trim(), is_internal: isInternal });
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 h-8 text-muted-foreground" asChild>
          <Link href="/admin/support">
            <ArrowLeft className="size-4 mr-1.5" />
            Back to support tickets
          </Link>
        </Button>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{ticket.subject}</h1>
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-normal">
                {SUPPORT_CATEGORY_LABELS[ticket.category] || ticket.category}
              </Badge>
              <span>•</span>
              <span>
                Opened <RelativeTime iso={ticket.created_at} />
              </span>
              <span>•</span>
              <span>
                Last update <RelativeTime iso={ticket.last_message_at} />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge kind="priority" value={ticket.priority} />
            <StatusBadge kind="ticket" value={ticket.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-3">
            {messages.map((m) => {
              const internal = Boolean(m.is_internal);
              const isAdminMsg = m.author_type === "admin" && !internal;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col",
                    internal ? "items-stretch" : isAdminMsg ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg border px-4 py-3 text-sm whitespace-pre-wrap break-words",
                      internal
                        ? "w-full border-amber-500/40 bg-amber-500/10"
                        : isAdminMsg
                          ? "max-w-[90%] border-sky-500/30 bg-sky-500/10"
                          : "max-w-[90%] border-border bg-card shadow-xs"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2 pb-1.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        {internal ? (
                          <Lock className="size-3.5 text-amber-700 dark:text-amber-300" />
                        ) : null}
                        <span className="font-medium text-foreground">
                          {internal
                            ? `Internal note (${m.author_id})`
                            : isAdminMsg
                              ? `Support (${m.author_id})`
                              : ticket.user_name || ticket.user_email || "Customer"}
                        </span>
                        {internal && (
                          <StatusBadge
                            kind="priority"
                            value="internal"
                            labelOverride="Hidden from user"
                          />
                        )}
                      </div>
                      <RelativeTime iso={m.created_at} className="text-[11px] text-muted-foreground" />
                    </div>

                    <div className="leading-relaxed text-foreground">{m.body}</div>

                    {m.has_attachment && m.attachment_url && (
                      <div className="mt-2">
                        <AuthenticatedSupportImage path={m.attachment_url} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="rounded-lg border-border bg-card shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold">
                  {isInternal ? "Add internal note" : "Reply to customer"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    id="internal-note-switch"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                  />
                  <Label htmlFor="internal-note-switch" className="text-xs cursor-pointer">
                    Internal note (never emailed)
                  </Label>
                </div>
              </div>
              <CardDescription className="text-xs">
                {isInternal
                  ? "Only admins can read internal notes. Zero notification emails are sent."
                  : "Visible to the customer and emailed immediately. Moves an open ticket to In progress."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReplySubmit} className="space-y-3">
                <Textarea
                  rows={4}
                  maxLength={5000}
                  placeholder={
                    isInternal
                      ? "Write a private internal triage note..."
                      : "Write your reply to the customer..."
                  }
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  required
                />
                <Button type="submit" disabled={replyMutation.isPending}>
                  {replyMutation.isPending ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : isInternal ? (
                    <Lock className="size-4 mr-2" />
                  ) : (
                    <Send className="size-4 mr-2" />
                  )}
                  {isInternal ? "Save internal note" : "Send reply"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sticky Sidebar Metadata & Status */}
        <div className="space-y-4 lg:sticky lg:top-20">
          <Card className="rounded-lg border-border bg-card shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Requester &amp; Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2.5 rounded-md border border-border p-2.5">
                <UserAvatar
                  userId={ticket.user_id}
                  name={ticket.user_name}
                  email={ticket.user_email}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/users/${ticket.user_id}`}
                    className="text-xs font-medium text-foreground hover:underline truncate block"
                  >
                    {ticket.user_name || ticket.user_email || ticket.user_id}
                  </Link>
                  {ticket.user_email && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {ticket.user_email}
                    </p>
                  )}
                </div>
                {ticket.user_email && (
                  <CopyButton
                    value={ticket.user_email}
                    label="Copy requester email"
                    toastLabel="Email copied"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Status</Label>
                <Select
                  value={selectedStatus}
                  onValueChange={(v) => setStatusOverride(v as SupportStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="status-email-switch" className="text-xs cursor-pointer">
                  Email user on status change
                </Label>
                <Switch
                  id="status-email-switch"
                  checked={sendStatusEmail}
                  onCheckedChange={setSendStatusEmail}
                />
              </div>

              <Button
                className="w-full"
                variant="outline"
                disabled={statusMutation.isPending || selectedStatus === ticket.status}
                onClick={() =>
                  statusMutation.mutate({ status: selectedStatus, send_email: sendStatusEmail })
                }
              >
                {statusMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Update status
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border bg-card shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Mail className="size-4" />
                Email notifications
              </CardTitle>
              <CardDescription className="text-xs">
                Delivery history logged for this ticket.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {email_logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No notification emails logged yet.</p>
              ) : (
                email_logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-border p-2.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{log.type}</span>
                      <StatusBadge kind="email" value={log.status} />
                    </div>
                    <div className="text-muted-foreground truncate">{log.to_email}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <RelativeTime iso={log.created_at} />
                    </div>
                    {log.error && <div className="text-destructive break-words">{log.error}</div>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
