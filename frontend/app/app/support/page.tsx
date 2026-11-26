"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  ChevronRight,
  Link2,
  LifeBuoy,
  Loader2,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  CopyButton,
  EmptyState,
  ErrorState,
  RelativeTime,
  StandardDialog,
} from "@/components/admin/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SUPPORT_CATEGORY_LABELS,
  SupportPriorityBadge,
  SupportStatusBadge,
} from "@/components/support/support-badges";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClientError, createSupportTicket, getMySupportTickets } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SupportCategory, SupportPriority } from "@/types/support";

const MAX_BYTES = 5 * 1024 * 1024;

export default function UserSupportPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const subjectInputRef = React.useRef<HTMLInputElement | null>(null);
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState<SupportCategory>("bug");
  const [priority, setPriority] = React.useState<SupportPriority>("medium");
  const [description, setDescription] = React.useState("");
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: () => getMySupportTickets({ status: "all", page: 1, page_size: 50 }),
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

  const categoryCards: Array<{
    category: SupportCategory;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    tileClass: string;
  }> = [
      {
        category: "billing",
        title: "Billing question",
        description: "Invoices, payments, upgrades, or renewal guidance.",
        icon: Wallet,
        tileClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      },
      {
        category: "linkedin_account",
        title: "LinkedIn connection issue",
        description: "Reconnect accounts, permission prompts, and auth errors.",
        icon: Link2,
        tileClass: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      },
      {
        category: "bug",
        title: "Bug report",
        description: "Unexpected behavior, crashes, or broken UI flows.",
        icon: Bug,
        tileClass: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
      },
      {
        category: "feature_request",
        title: "Feature request",
        description: "Share ideas that would improve your workflow.",
        icon: Sparkles,
        tileClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      },
    ];

  const openNewTicketDialog = (nextCategory?: SupportCategory) => {
    if (nextCategory) setCategory(nextCategory);
    setDialogOpen(true);
  };

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

  const allItems = React.useMemo(() => ticketsQuery.data?.items || [], [ticketsQuery.data?.items]);
  const counts = React.useMemo(
    () => ({
      all: allItems.length,
      open: allItems.filter((item) => item.status === "open").length,
      in_progress: allItems.filter((item) => item.status === "in_progress").length,
      resolved: allItems.filter((item) => item.status === "resolved").length,
    }),
    [allItems]
  );
  const items = React.useMemo(() => {
    if (statusFilter === "all") return allItems;
    return allItems.filter((item) => item.status === statusFilter);
  }, [allItems, statusFilter]);

  const statusAccent: Record<string, string> = {
    open: "bg-sky-500",
    in_progress: "bg-violet-500",
    resolved: "bg-emerald-500",
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1100px] mx-auto space-y-6 w-full min-w-0 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contact our team for billing questions, LinkedIn issues, or bug reports.
          </p>
        </div>
        <Button className="shrink-0 self-start sm:self-auto" onClick={() => openNewTicketDialog()}>
          <Plus className="size-4 mr-2" />
          New ticket
        </Button>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="inline-flex flex-wrap max-w-full h-auto rounded-xl border border-border bg-card p-1 gap-1">
          {[
            { key: "all", label: "All", count: counts.all },
            { key: "open", label: "Open", count: counts.open },
            { key: "in_progress", label: "In progress", count: counts.in_progress },
            { key: "resolved", label: "Resolved", count: counts.resolved },
          ].map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="gap-2 rounded-lg px-3 py-1.5 text-sm"
            >
              <span>{tab.label}</span>
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {tab.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {ticketsQuery.isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((n) => (
            <Card key={n} className="relative overflow-hidden">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-muted" />
              <CardContent className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <Skeleton className="h-4 w-2/5" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                  </div>
                  <Skeleton className="size-4 rounded shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : ticketsQuery.isError ? (
        <ErrorState
          title="Could not load support tickets"
          message="We could not fetch your support history right now."
          onRetry={() => ticketsQuery.refetch()}
        />
      ) : allItems.length === 0 ? (
        <Card className="overflow-hidden">
          <CardContent className="px-5 py-8 sm:px-8 sm:py-10">
            <div className="mx-auto max-w-2xl space-y-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LifeBuoy className="size-6" strokeWidth={1.8} />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold tracking-tight">No support tickets yet</h2>
                <p className="text-sm text-muted-foreground">
                  Pick a category below to start a new ticket with the right context.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-left">
                {categoryCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.category}
                      type="button"
                      onClick={() => openNewTicketDialog(item.category)}
                      className="group rounded-xl border border-border bg-card px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", item.tileClass)}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                <Link href="/#faq" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Browse help docs
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title={`No ${statusFilter === "in_progress" ? "in progress" : statusFilter} tickets`}
          description="Try another filter or open a new ticket if you need help."
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((t) => (
            <Link key={t.id} href={`/app/support/${t.id}`} className="block group">
              <Card className="relative overflow-hidden transition-all group-hover:-translate-y-0.5 group-hover:shadow-sm group-hover:border-foreground/20">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-0 left-0 w-[3px]",
                    statusAccent[t.status] || "bg-muted-foreground"
                  )}
                />
                <CardContent className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 space-y-2">
                      <p className="truncate text-sm font-medium text-foreground">{t.subject}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {SUPPORT_CATEGORY_LABELS[t.category] || t.category}
                        </Badge>
                        <SupportStatusBadge status={t.status} />
                        <SupportPriorityBadge priority={t.priority} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span
                          className="inline-flex items-center gap-1"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <span className="font-mono">#{t.id.slice(0, 8).toUpperCase()}</span>
                          <CopyButton
                            value={t.id}
                            label={`Copy ticket ID ${t.id}`}
                            toastLabel="Ticket ID copied"
                          />
                        </span>
                        <span>
                          Updated{" "}
                          <RelativeTime iso={t.updated_at || t.last_message_at || t.created_at} />
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5">
                      <ChevronRight className="size-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <StandardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialFocusRef={subjectInputRef}
        title="New support ticket"
        description="Describe what happened. You can attach a PNG, JPG, or WebP screenshot up to 5 MB."
        icon={LifeBuoy}
        tone="info"
        maxWidth="sm:max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" form="new-ticket-form" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Submit ticket
            </Button>
          </>
        }
      >
        <form id="new-ticket-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              ref={subjectInputRef}
              id="ticket-subject"
              maxLength={150}
              placeholder="Brief summary of the issue"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Keep this short and specific.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              placeholder="Include steps to reproduce, transaction IDs, and what you expected."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Plain language is perfect. Add one issue per ticket.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-file">Screenshot</Label>
            <Input
              id="ticket-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">Optional. PNG, JPG, or WebP up to 5 MB.</p>
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
        </form>
      </StandardDialog>
    </div>
  );
}
