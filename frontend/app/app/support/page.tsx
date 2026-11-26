"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Loader2, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatSupportDate,
  SUPPORT_CATEGORY_LABELS,
  SupportPriorityBadge,
  SupportStatusBadge,
} from "@/components/support/support-badges";
import { ApiClientError, createSupportTicket, getMySupportTickets } from "@/lib/api";
import type { SupportCategory, SupportPriority } from "@/types/support";

const MAX_BYTES = 5 * 1024 * 1024;

export default function UserSupportPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState<SupportCategory>("bug");
  const [priority, setPriority] = React.useState<SupportPriority>("medium");
  const [description, setDescription] = React.useState("");
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ["my-support-tickets", statusFilter, page],
    queryFn: () => getMySupportTickets({ status: statusFilter, page, page_size: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: createSupportTicket,
    onSuccess: (res) => {
      toast.success("Support ticket submitted");
      setDialogOpen(false);
      setSubject("");
      setCategory("bug");
      setPriority("medium");
      setDescription("");
      setAttachment(null);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
      if (res.ticket?.id) {
        queryClient.setQueryData(["my-support-ticket", res.ticket.id], res);
      }
    },
    onError: (err) => {
      const msg =
        err instanceof ApiClientError ? err.message : "Could not submit your support ticket.";
      setFormError(msg);
      toast.error(msg);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFormError(null);
    if (!f) {
      setAttachment(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setFormError("Screenshot must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setFormError("Only PNG, JPG, or WebP images are allowed.");
      e.target.value = "";
      return;
    }
    setAttachment(f);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!subject.trim() || subject.trim().length > 150) {
      setFormError("Subject is required and must be 150 characters or fewer.");
      return;
    }
    if (!description.trim() || description.trim().length > 5000) {
      setFormError("Description is required and must be 5,000 characters or fewer.");
      return;
    }
    createMutation.mutate({
      subject: subject.trim(),
      category,
      priority,
      description: description.trim(),
      attachment,
    });
  }

  const items = ticketsQuery.data?.items || [];
  const totalPages = ticketsQuery.data?.total_pages || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contact our team for billing questions, LinkedIn issues, or bug reports.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          New ticket
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All" },
          { key: "open", label: "Open" },
          { key: "in_progress", label: "In progress" },
          { key: "resolved", label: "Resolved" },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={statusFilter === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStatusFilter(tab.key);
              setPage(1);
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {ticketsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : ticketsQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load your support tickets right now.</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <LifeBuoy className="size-8 text-muted-foreground mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium">No support tickets yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Need help with your subscription, scheduled posts, or LinkedIn connection? Open a
              ticket and we will follow up by email and here.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
              Create your first ticket
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <Link key={t.id} href={`/app/support/${t.id}`} className="block group">
              <Card className="transition-colors group-hover:border-foreground/30">
                <CardHeader className="py-4 px-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <CardTitle className="text-base font-medium truncate">
                        {t.subject}
                      </CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span>{SUPPORT_CATEGORY_LABELS[t.category] || t.category}</span>
                        <span>•</span>
                        <span>Last update {formatSupportDate(t.last_message_at)}</span>
                        {typeof t.message_count === "number" && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <MessageSquare className="size-3" />
                              {t.message_count}
                            </span>
                          </>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <SupportPriorityBadge priority={t.priority} />
                      <SupportStatusBadge status={t.status} />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New support ticket</DialogTitle>
            <DialogDescription>
              Describe what happened. You can attach a PNG, JPG, or WebP screenshot up to 5 MB.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input
                id="ticket-subject"
                maxLength={150}
                placeholder="Brief summary of the issue"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUPPORT_CATEGORY_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as SupportPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="ticket-desc">Description</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {description.length}/5000
                </span>
              </div>
              <Textarea
                id="ticket-desc"
                rows={5}
                maxLength={5000}
                placeholder="Include steps to reproduce, payment transaction IDs, or what you expected."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ticket-file">Screenshot (optional, PNG/JPG/WebP, max 5 MB)</Label>
              <Input
                id="ticket-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
              />
              {attachment && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{attachment.name}</span>
                  <button
                    type="button"
                    className="underline ml-2 shrink-0"
                    onClick={() => setAttachment(null)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Submit ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
