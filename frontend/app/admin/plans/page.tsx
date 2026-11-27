"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  Layers,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminModalField,
  AdminModalSection,
  FieldGrid,
  InputWithAffix,
  RepeatList,
  ToggleRow,
} from "@/components/admin/modal-parts";
import {
  ConfirmDialog,
  DataTableShell,
  DialogCallout,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanBadge,
  StandardDialog,
  StatusBadge,
  TableSkeleton,
} from "@/components/admin/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ApiClientError,
  createAdminPlan,
  deleteAdminPlan,
  getAdminPlansOverview,
  updateAdminPlan,
} from "@/lib/api";
import type { AdminPlanOverviewItem } from "@/types/admin";

function fmtLimit(val: number | null) {
  if (val === null || val === undefined) return "Unlimited";
  return val.toLocaleString();
}

function parseOptionalInt(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n);
}

function parseOptionalCentsFromUsd(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

interface PlanFormState {
  id: string;
  name: string;
  monthlyUsd: string;
  sortOrder: string;
  isPublic: boolean;
  isPopular: boolean;
  rateLimitTier: string;
  linkedinProfiles: string;
  scheduledPosts: string;
  playgroundRuns: string;
  playgroundPerDay: string;
  maxPostDays: string;
  docsTokenLimit: string;
  dailySpendUsd: string;
  approvalEmail: boolean;
  approvalSlack: boolean;
  analyticsLevel: string;
  supportLabel: string;
  extraFeaturesText: string;
  reason: string;
}

function initialForm(plan?: AdminPlanOverviewItem): PlanFormState {
  if (!plan) {
    return {
      id: "",
      name: "",
      monthlyUsd: "29.99",
      sortOrder: "5",
      isPublic: true,
      isPopular: false,
      rateLimitTier: "pro",
      linkedinProfiles: "1",
      scheduledPosts: "25",
      playgroundRuns: "8",
      playgroundPerDay: "4",
      maxPostDays: "5",
      docsTokenLimit: "5000",
      dailySpendUsd: "2.50",
      approvalEmail: true,
      approvalSlack: true,
      analyticsLevel: "full",
      supportLabel: "email",
      extraFeaturesText: "",
      reason: "",
    };
  }
  return {
    id: plan.id,
    name: plan.name,
    monthlyUsd: plan.monthly_price_usd !== null ? String(plan.monthly_price_usd) : "",
    sortOrder: String(plan.sort_order ?? 0),
    isPublic: plan.is_public,
    isPopular: Boolean(plan.is_popular),
    rateLimitTier: plan.rate_limit_tier || "starter",
    linkedinProfiles:
      plan.limits.linkedin_profiles !== null ? String(plan.limits.linkedin_profiles) : "",
    scheduledPosts:
      plan.limits.scheduled_posts_per_period !== null
        ? String(plan.limits.scheduled_posts_per_period)
        : "",
    playgroundRuns:
      plan.limits.playground_runs_per_period !== null
        ? String(plan.limits.playground_runs_per_period)
        : "",
    playgroundPerDay:
      plan.limits.playground_runs_per_day !== null
        ? String(plan.limits.playground_runs_per_day)
        : "",
    maxPostDays:
      plan.limits.max_post_days_per_week !== null
        ? String(plan.limits.max_post_days_per_week)
        : "",
    docsTokenLimit:
      plan.limits.docs_token_limit !== null ? String(plan.limits.docs_token_limit) : "",
    dailySpendUsd:
      plan.limits.daily_spend_limit_usd !== null ? String(plan.limits.daily_spend_limit_usd) : "",
    approvalEmail: plan.features.approval_email,
    approvalSlack: plan.features.approval_slack,
    analyticsLevel: plan.features.analytics_level,
    supportLabel: plan.features.support_label,
    extraFeaturesText: (plan.extra_features || []).join("\n"),
    reason: "",
  };
}

export default function AdminPlansPage() {
  const qc = useQueryClient();
  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: getAdminPlansOverview,
    staleTime: 30_000,
  });

  const [dialogMode, setDialogMode] = React.useState<"create" | "edit" | null>(null);
  const [editingPlan, setEditingPlan] = React.useState<AdminPlanOverviewItem | null>(null);
  const [form, setForm] = React.useState<PlanFormState>(() => initialForm());
  const [formError, setFormError] = React.useState<string | null>(null);

  const [archiveTarget, setArchiveTarget] = React.useState<AdminPlanOverviewItem | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const archiveReasonRef = React.useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<AdminPlanOverviewItem | null>(null);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = React.useState("");
  const [deleteReason, setDeleteReason] = React.useState("");
  const deleteSlugRef = React.useRef<HTMLInputElement | null>(null);
  const slugInputRef = React.useRef<HTMLInputElement | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);
  const errorRef = React.useRef<HTMLParagraphElement | null>(null);

  React.useEffect(() => {
    if (formError) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [formError]);

  const data = plansQuery.data;
  const tiers = data?.rate_limit_tiers || ["trial", "starter", "pro", "business", "internal"];

  const openCreate = () => {
    setEditingPlan(null);
    setForm(initialForm());
    setFormError(null);
    setDialogMode("create");
  };

  const openEdit = (p: AdminPlanOverviewItem) => {
    setEditingPlan(p);
    setForm(initialForm(p));
    setFormError(null);
    setDialogMode("edit");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const monthlyCents = parseOptionalCentsFromUsd(form.monthlyUsd);
      const spendCents = parseOptionalCentsFromUsd(form.dailySpendUsd);
      const linkedinProfiles = parseOptionalInt(form.linkedinProfiles);
      const scheduledPosts = parseOptionalInt(form.scheduledPosts);
      const playgroundRuns = parseOptionalInt(form.playgroundRuns);
      const playgroundPerDay = parseOptionalInt(form.playgroundPerDay);
      const maxPostDays = parseOptionalInt(form.maxPostDays);
      const docsTokenLimit = parseOptionalInt(form.docsTokenLimit);
      const sortOrder = Number(form.sortOrder || 0);

      for (const [label, v] of [
        ["Monthly price", monthlyCents],
        ["Daily spend limit", spendCents],
        ["LinkedIn profiles", linkedinProfiles],
        ["Scheduled posts", scheduledPosts],
        ["Playground runs", playgroundRuns],
        ["Playground per day", playgroundPerDay],
        ["Max post days/week", maxPostDays],
        ["Docs token limit", docsTokenLimit],
      ] as const) {
        if (Number.isNaN(v)) {
          throw new Error(`${label} must be a non-negative number or blank for unlimited.`);
        }
      }
      if (!form.name.trim()) throw new Error("Plan name is required.");
      if (form.reason.trim().length < 2) throw new Error("Reason is required (2+ chars).");

      const extraFeatures = form.extraFeaturesText
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);

      const commonPayload: Record<string, unknown> = {
        name: form.name.trim(),
        monthly_price_cents: monthlyCents,
        sort_order: Number.isFinite(sortOrder) ? Math.round(sortOrder) : 0,
        is_public: form.isPublic,
        is_popular: form.isPopular,
        rate_limit_tier: form.rateLimitTier,
        linkedin_profiles: linkedinProfiles,
        scheduled_posts_per_period: scheduledPosts,
        playground_runs_per_period: playgroundRuns,
        playground_runs_per_day: playgroundPerDay,
        max_post_days_per_week: maxPostDays,
        docs_token_limit: docsTokenLimit,
        daily_spend_limit_cents: spendCents,
        approval_email: form.approvalEmail,
        approval_slack: form.approvalSlack,
        analytics_level: form.analyticsLevel,
        support_label: form.supportLabel.trim(),
        extra_features: extraFeatures,
        reason: form.reason.trim(),
      };

      if (dialogMode === "create") {
        if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(form.id.trim().toLowerCase())) {
          throw new Error("Slug must use lowercase letters, numbers, and single hyphens.");
        }
        return createAdminPlan({
          id: form.id.trim().toLowerCase(),
          is_active: true,
          ...commonPayload,
        });
      }
      if (!editingPlan) throw new Error("No plan selected.");
      return updateAdminPlan(editingPlan.id, {
        expected_version: editingPlan.version ?? 1,
        ...commonPayload,
      });
    },
    onSuccess: (res) => {
      setDialogMode(null);
      setFormError(null);
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["public", "plans"] });
      if (res.revalidate_warning) {
        toast.warning(res.revalidate_warning);
      } else {
        toast.success(dialogMode === "create" ? "Plan created." : "Plan updated.");
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError && err.status === 409) {
        qc.invalidateQueries({ queryKey: ["admin-plans"] });
      }
      const msg = err instanceof Error ? err.message : "Could not save plan.";
      setFormError(msg);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => {
      if (!archiveTarget) throw new Error("No plan selected");
      const restoring = archiveTarget.is_active === false;
      return updateAdminPlan(archiveTarget.id, {
        expected_version: archiveTarget.version ?? 1,
        is_active: restoring,
        is_public: restoring ? true : false,
        reason: archiveReason.trim(),
      });
    },
    onSuccess: (res) => {
      setArchiveTarget(null);
      setArchiveReason("");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["public", "plans"] });
      if (res.revalidate_warning) toast.warning(res.revalidate_warning);
      else toast.success("Plan visibility updated.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No plan selected");
      return deleteAdminPlan(deleteTarget.id, {
        reason: deleteReason.trim(),
        confirm_slug: deleteConfirmSlug.trim().toLowerCase(),
        expected_version: deleteTarget.version,
      });
    },
    onSuccess: (res) => {
      setDeleteTarget(null);
      setDeleteConfirmSlug("");
      setDeleteReason("");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["public", "plans"] });
      if (res.revalidate_warning) toast.warning(res.revalidate_warning);
      else toast.success("Plan deleted.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete plan.");
    },
  });

  const previewUsdNum = Number(form.monthlyUsd);
  const previewPriceDisplay =
    form.monthlyUsd.trim() === ""
      ? "Custom"
      : Number.isFinite(previewUsdNum) && previewUsdNum >= 0
        ? previewUsdNum === 0
          ? "$0"
          : `$${previewUsdNum.toFixed(2)}`
        : "—";
  const previewExtraFeatures = form.extraFeaturesText
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const previewCard = (
    <Card className="rounded-lg border-border bg-card shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{form.name || "Untitled Plan"}</CardTitle>
          {form.isPopular && (
            <Badge variant="outline" className="text-[10px]">
              Popular
            </Badge>
          )}
        </div>
        <div className="pt-2">
          <span className="text-2xl font-semibold tabular-nums">{previewPriceDisplay}</span>
          {form.monthlyUsd.trim() !== "" && (
            <span className="text-xs text-muted-foreground ml-1">/ month</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            {form.scheduledPosts.trim() === ""
              ? "Unlimited scheduled posts"
              : `${form.scheduledPosts} scheduled posts/mo`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            {form.playgroundRuns.trim() === ""
              ? "Unlimited Playground runs"
              : `${form.playgroundRuns} Playground runs/mo`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {form.approvalSlack ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <Lock className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className={form.approvalSlack ? "" : "text-muted-foreground"}>
            Slack + email approval
          </span>
        </div>
        <div className="flex items-center gap-2">
          {form.analyticsLevel !== "none" ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <Lock className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className={form.analyticsLevel !== "none" ? "" : "text-muted-foreground"}>
            Analytics: {form.analyticsLevel}
          </span>
        </div>
        {previewExtraFeatures.map((feat) => (
          <div key={feat} className="flex items-center gap-2">
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{feat}</span>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button type="button" className="w-full" size="sm" disabled>
          Choose {form.name || "Plan"}
        </Button>
      </CardFooter>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans"
        description={
          data
            ? `Database-backed tiers (${data.currency}, 1 USD = Rs ${data.pkr_per_usd}, ${Math.round(data.annual_discount * 100)}% annual discount, ${data.trial_days ?? 3}-day trial).`
            : "Database-backed plans, pricing, and limits."
        }
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="size-4 mr-1.5" />
            New plan
          </Button>
        }
      />

      {plansQuery.isError ? (
        <ErrorState
          title="Could not load plans"
          message="Failed to fetch plan configurations."
          onRetry={() => plansQuery.refetch()}
        />
      ) : (
        <DataTableShell title="Configured plans" description="Ordered by display sort_order">
          {plansQuery.isLoading || !data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Price (Mo / Yr)</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Subscribers</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableSkeleton columns={8} rows={5} />
            </Table>
          ) : data.plans.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No plans configured"
              description="Create your first plan tier to enable checkout."
              action={
                <Button size="sm" onClick={openCreate}>
                  Create plan
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Price (Mo / Yr)</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Rate tier</TableHead>
                  <TableHead className="text-right">Subscribers</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((p) => {
                  const archived = p.is_active === false;
                  const canHardDelete = !p.is_system && (p.references_count ?? 0) === 0;
                  const visibilityVal = archived ? "archived" : p.is_public ? "public" : "private";
                  return (
                    <TableRow key={p.id} className={archived ? "opacity-65" : undefined}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <PlanBadge planId={p.id} planName={p.name} />
                          {p.is_popular && (
                            <Badge variant="outline" className="text-[10px]">
                              Popular
                            </Badge>
                          )}
                          {p.is_system && (
                            <Badge variant="secondary" className="text-[10px]">
                              System
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.id}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                        {p.monthly_price_usd === null ? (
                          "—"
                        ) : p.monthly_price_usd === 0 ? (
                          `Free (${p.plan_length_days}d)`
                        ) : (
                          <div>
                            <div className="font-medium text-foreground">
                              ${p.monthly_price_usd.toFixed(2)}/mo
                            </div>
                            {p.annual_price_usd !== null && (
                              <div className="text-muted-foreground">
                                ${p.annual_price_usd.toFixed(2)}/yr
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Posts: {fmtLimit(p.limits.scheduled_posts_per_period)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            PG: {fmtLimit(p.limits.playground_runs_per_period)} (
                            {fmtLimit(p.limits.playground_runs_per_day)}/d)
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Docs: {fmtLimit(p.limits.docs_token_limit)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-normal capitalize">
                            {p.features.analytics_level} analytics
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.rate_limit_tier || p.id}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                        {p.subscribers.active} active / {p.subscribers.total}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="visibility" value={visibilityVal} />
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={`Edit ${p.name}`}
                                onClick={() => openEdit(p)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit plan</TooltipContent>
                          </Tooltip>

                          {!p.is_system && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  aria-label={archived ? `Restore ${p.name}` : `Archive ${p.name}`}
                                  onClick={() => {
                                    setArchiveTarget(p);
                                    setArchiveReason("");
                                  }}
                                >
                                  {archived ? (
                                    <RotateCcw className="size-4" />
                                  ) : (
                                    <Archive className="size-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{archived ? "Restore plan" : "Archive plan"}</TooltipContent>
                            </Tooltip>
                          )}

                          {canHardDelete && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-destructive hover:text-destructive"
                                  aria-label={`Delete ${p.name}`}
                                  onClick={() => {
                                    setDeleteTarget(p);
                                    setDeleteConfirmSlug("");
                                    setDeleteReason("");
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete unused plan</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DataTableShell>
      )}

      {/* Create / Edit Plan Dialog with Live Pricing Preview */}
      <StandardDialog
        open={dialogMode !== null}
        onOpenChange={(o) => !o && setDialogMode(null)}
        initialFocusRef={dialogMode === "create" ? slugInputRef : nameInputRef}
        title={dialogMode === "create" ? "New plan" : `Edit plan: ${editingPlan?.name}`}
        description={
          dialogMode === "create"
            ? "Create a new plan tier. Annual price is computed automatically with the 5% discount rule."
            : `Version ${editingPlan?.version ?? 1}. Limit changes apply immediately; price changes affect new payments only.`
        }
        icon={Layers}
        tone="info"
        maxWidth="sm:max-w-3xl"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDialogMode(null)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving..."
                : dialogMode === "create"
                  ? "Create plan"
                  : "Save changes"}
            </Button>
          </>
        }
      >
        {dialogMode === "edit" && editingPlan && editingPlan.subscribers.total > 0 && (
          <DialogCallout tone="warning" title="Active subscribers notice">
            This plan currently has <strong>{editingPlan.subscribers.active}</strong> active (
            <strong>{editingPlan.subscribers.total}</strong> total) subscriber(s). Limit edits apply
            to them immediately.
          </DialogCallout>
        )}

        <AdminModalSection title="Basics">
          <FieldGrid cols={2}>
            <AdminModalField
              label="Slug"
              required={dialogMode === "create"}
              helper={
                dialogMode === "edit"
                  ? "Slug is locked after creation."
                  : "Lowercase letters, numbers, and hyphens."
              }
            >
              <div className="relative">
                {dialogMode === "edit" && (
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                )}
                <Input
                  ref={slugInputRef}
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  disabled={dialogMode === "edit"}
                  placeholder="e.g. agency-plus"
                  className={dialogMode === "edit" ? "pl-9" : undefined}
                />
              </div>
            </AdminModalField>

            <AdminModalField label="Name" required>
              <Input
                ref={nameInputRef}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="Sort order">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="Rate tier">
              <Select
                value={form.rateLimitTier}
                onValueChange={(v) => setForm({ ...form, rateLimitTier: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tiers.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminModalField>
          </FieldGrid>
        </AdminModalSection>

        <AdminModalSection title="Pricing">
          <FieldGrid cols={2}>
            <AdminModalField
              label="Monthly price"
              helper="USD. Leave blank for no listed price."
            >
              <InputWithAffix
                prefix="$"
                suffix="/month"
                type="number"
                step="0.01"
                value={form.monthlyUsd}
                onChange={(e) => setForm({ ...form, monthlyUsd: e.target.value })}
              />
            </AdminModalField>
          </FieldGrid>
        </AdminModalSection>

        <AdminModalSection title="Limits">
          <FieldGrid cols={3}>
            <AdminModalField
              label="Scheduled posts"
              helper="Per billing period. Blank means unlimited."
            >
              <InputWithAffix
                suffix="posts"
                value={form.scheduledPosts}
                onChange={(e) => setForm({ ...form, scheduledPosts: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="Playground runs" helper="Per billing period.">
              <InputWithAffix
                suffix="runs"
                value={form.playgroundRuns}
                onChange={(e) => setForm({ ...form, playgroundRuns: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="Playground runs per day">
              <InputWithAffix
                suffix="runs"
                value={form.playgroundPerDay}
                onChange={(e) => setForm({ ...form, playgroundPerDay: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="Max post days per week">
              <InputWithAffix
                suffix="days"
                value={form.maxPostDays}
                onChange={(e) => setForm({ ...form, maxPostDays: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="LinkedIn profiles">
              <Input
                value={form.linkedinProfiles}
                onChange={(e) => setForm({ ...form, linkedinProfiles: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="Docs token limit">
              <Input
                value={form.docsTokenLimit}
                onChange={(e) => setForm({ ...form, docsTokenLimit: e.target.value })}
              />
            </AdminModalField>

            <AdminModalField label="Daily spend limit" helper="USD.">
              <InputWithAffix
                prefix="$"
                type="number"
                step="0.01"
                value={form.dailySpendUsd}
                onChange={(e) => setForm({ ...form, dailySpendUsd: e.target.value })}
              />
            </AdminModalField>
          </FieldGrid>
        </AdminModalSection>

        <AdminModalSection title="Features and access">
          <FieldGrid cols={2}>
            <AdminModalField label="Analytics level">
              <Select
                value={form.analyticsLevel}
                onValueChange={(v) => setForm({ ...form, analyticsLevel: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="basic">basic</SelectItem>
                  <SelectItem value="full">full</SelectItem>
                </SelectContent>
              </Select>
            </AdminModalField>

            <AdminModalField label="Support label">
              <Input
                value={form.supportLabel}
                onChange={(e) => setForm({ ...form, supportLabel: e.target.value })}
              />
            </AdminModalField>
          </FieldGrid>

          <FieldGrid cols={2}>
            <ToggleRow
              label="Approval by email"
              checked={form.approvalEmail}
              onCheckedChange={(v) => setForm({ ...form, approvalEmail: v })}
            />
            <ToggleRow
              label="Approval by Slack"
              checked={form.approvalSlack}
              onCheckedChange={(v) => setForm({ ...form, approvalSlack: v })}
            />
          </FieldGrid>

          <AdminModalField label="Extra features" helper="One bullet per row.">
            <RepeatList
              items={form.extraFeaturesText.split("\n")}
              onChange={(rows) => setForm({ ...form, extraFeaturesText: rows.join("\n") })}
              placeholder="Priority onboarding"
              addLabel="Add feature"
            />
          </AdminModalField>
        </AdminModalSection>

        <AdminModalSection title="Visibility">
          <FieldGrid cols={2}>
            <ToggleRow
              label="Public listing"
              checked={form.isPublic}
              onCheckedChange={(v) => setForm({ ...form, isPublic: v })}
            />
            <ToggleRow
              label="Popular badge"
              checked={form.isPopular}
              onCheckedChange={(v) => setForm({ ...form, isPopular: v })}
            />
          </FieldGrid>

          {dialogMode === "edit" && editingPlan && (
            <AdminModalField label="Locked settings">
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Plan length: {editingPlan.plan_length_days} days · System plan:{" "}
                {editingPlan.is_system ? "Yes" : "No"}
              </div>
            </AdminModalField>
          )}
        </AdminModalSection>

        <AdminModalField label="Change reason" required helper="Required for audit logs.">
          <Input
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="e.g. Q4 pricing adjustment"
          />
        </AdminModalField>

        <Accordion type="single" collapsible>
          <AccordionItem value="preview">
            <AccordionTrigger>Pricing card preview</AccordionTrigger>
            <AccordionContent>{previewCard}</AccordionContent>
          </AccordionItem>
        </Accordion>

        {formError && (
          <p ref={errorRef} className="text-xs font-medium text-destructive">
            {formError}
          </p>
        )}
      </StandardDialog>

      {/* Archive / Restore Confirm Dialog */}
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        maxWidth="sm:max-w-md"
        initialFocusRef={archiveReasonRef}
        title={`${archiveTarget?.is_active === false ? "Restore" : "Archive"} ${archiveTarget?.name}?`}
        description="Update whether new customers can view and purchase this plan tier."
        icon={archiveTarget?.is_active === false ? RotateCcw : Archive}
        summary={
          archiveTarget?.is_active === false
            ? "Restoring makes this plan active and publicly selectable on pricing and checkout."
            : "Archiving hides this plan from pricing and new checkouts while letting existing subscribers keep their entitlements."
        }
        summaryTone={archiveTarget?.is_active === false ? "info" : "warning"}
        confirmLabel={archiveTarget?.is_active === false ? "Restore plan" : "Archive plan"}
        isPending={archiveMutation.isPending}
        disabled={archiveReason.trim().length < 2}
        onConfirm={() => archiveMutation.mutate()}
      >
        <AdminModalField label="Reason" required htmlFor="archive-reason">
          <Input
            ref={archiveReasonRef}
            id="archive-reason"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder="e.g. Replaced by new tier"
          />
        </AdminModalField>
      </ConfirmDialog>

      {/* Hard Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        maxWidth="sm:max-w-md"
        initialFocusRef={deleteSlugRef}
        title={`Delete ${deleteTarget?.name} permanently?`}
        description={
          <span>
            This plan has zero subscription or payment references. Type{" "}
            <code className="font-mono font-semibold text-foreground">{deleteTarget?.id}</code> to
            confirm.
          </span>
        }
        icon={Trash2}
        summary="This permanently deletes the plan record from PostgreSQL and cannot be undone."
        summaryTone="danger"
        destructive
        confirmLabel="Delete plan"
        isPending={deleteMutation.isPending}
        disabled={
          deleteReason.trim().length < 2 ||
          deleteConfirmSlug.trim().toLowerCase() !== (deleteTarget?.id || "")
        }
        onConfirm={() => deleteMutation.mutate()}
      >
        <AdminModalField label="Confirm slug" required htmlFor="del-plan-slug">
          <Input
            ref={deleteSlugRef}
            id="del-plan-slug"
            value={deleteConfirmSlug}
            onChange={(e) => setDeleteConfirmSlug(e.target.value)}
            placeholder={deleteTarget?.id}
          />
        </AdminModalField>
        <AdminModalField label="Reason" required htmlFor="del-plan-reason">
          <Input
            id="del-plan-reason"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
        </AdminModalField>
      </ConfirmDialog>
    </div>
  );
}
