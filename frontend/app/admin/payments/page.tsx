"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  DollarSign,
  Plus,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AdminExportButton } from "@/components/admin/export-button";
import {
  ConfirmDialog,
  CopyButton,
  DataTableShell,
  DialogCallout,
  EmptyState,
  ErrorState,
  MethodBadge,
  PageHeader,
  PaginationFooter,
  PlanBadge,
  RelativeTime,
  StandardDialog,
  StatCard,
  StatCardSkeleton,
  StatusBadge,
  TableSkeleton,
  Toolbar,
  UserAvatar,
} from "@/components/admin/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiClientError,
  approveAdminPayment,
  getAdminOverview,
  getAdminPayments,
  getAdminPlansOverview,
  getAdminUserDetail,
  getAdminUsers,
  recordAdminPayment,
  rejectAdminPayment,
  voidAdminPayment,
} from "@/lib/api";
import type { AdminUserListItem } from "@/types/admin";
import type { AdminPaymentItem } from "@/types/plans";

const REJECT_PRESETS = [
  "Transaction ID not found",
  "Amount mismatch",
  "Duplicate submission",
  "Receipt screenshot unclear",
];

function previewSubtractedEndDate(
  currentEndIso: string | null | undefined,
  interval: string
): string {
  if (!currentEndIso) return "No subscription end date set";
  const d = new Date(currentEndIso);
  if (Number.isNaN(d.getTime())) return currentEndIso;
  const now = new Date();
  const months = interval === "annual" ? 12 : 1;
  const subtracted = new Date(d.getTime());
  subtracted.setUTCMonth(subtracted.getUTCMonth() - months);
  const clamped = subtracted.getTime() < now.getTime() ? now : subtracted;
  return clamped.toISOString().slice(0, 10) + " UTC";
}

export default function AdminPaymentsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"pending" | "approved" | "rejected" | "voided" | "all">(
    "pending"
  );
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState("all");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);

  const [confirmApprove, setConfirmApprove] = React.useState<AdminPaymentItem | null>(null);
  const [confirmReject, setConfirmReject] = React.useState<AdminPaymentItem | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [emailWarning, setEmailWarning] = React.useState<{
    userId?: string;
    message: string;
  } | null>(null);

  const [recordOpen, setRecordOpen] = React.useState(false);
  const [userSearch, setUserSearch] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState<AdminUserListItem | null>(null);
  const [recPlanId, setRecPlanId] = React.useState("starter");
  const [recInterval, setRecInterval] = React.useState<"monthly" | "annual">("monthly");
  const [recAmountUsd, setRecAmountUsd] = React.useState("");
  const [recMethod, setRecMethod] = React.useState("manual");
  const [recTxId, setRecTxId] = React.useState("");
  const [recPaidAt, setRecPaidAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [recEndsAt, setRecEndsAt] = React.useState("");
  const [recActivate, setRecActivate] = React.useState(true);
  const [recSendEmail, setRecSendEmail] = React.useState(true);
  const [recNote, setRecNote] = React.useState("");
  const [recError, setRecError] = React.useState<string | null>(null);
  const recordUserSearchRef = React.useRef<HTMLInputElement | null>(null);

  const [voidTarget, setVoidTarget] = React.useState<AdminPaymentItem | null>(null);
  const [voidReason, setVoidReason] = React.useState("");
  const [voidRevoke, setVoidRevoke] = React.useState(true);
  const [voidSendEmail, setVoidSendEmail] = React.useState(true);
  const [voidMessage, setVoidMessage] = React.useState("");
  const voidReasonRef = React.useRef<HTMLInputElement | null>(null);
  const rejectReasonRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(false),
    staleTime: 60_000,
  });

  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: getAdminPlansOverview,
    staleTime: 60_000,
  });

  const paidPlans = React.useMemo(
    () => (plansQuery.data?.plans || []).filter((p) => !p.is_system),
    [plansQuery.data]
  );

  const defaultUsdFor = (pid: string, intervalVal: "monthly" | "annual") => {
    const p = paidPlans.find((item) => item.id === pid);
    if (!p) return "";
    const price = intervalVal === "annual" ? p.annual_price_usd : p.monthly_price_usd;
    return price !== null && price !== undefined ? price.toFixed(2) : "";
  };

  const userSearchQuery = useQuery({
    queryKey: ["admin-user-picker", userSearch],
    queryFn: () =>
      getAdminUsers({ search: userSearch.trim() || undefined, page: 1, page_size: 8 }),
    enabled: recordOpen,
    staleTime: 10_000,
  });

  const voidUserDetailQuery = useQuery({
    queryKey: ["admin-user-detail", voidTarget?.user_id],
    queryFn: () => getAdminUserDetail(voidTarget!.user_id),
    enabled: voidTarget !== null,
  });

  const paymentsQuery = useQuery({
    queryKey: ["admin-payments", tab, debouncedSearch, methodFilter, planFilter, page],
    queryFn: () =>
      getAdminPayments({
        status: tab,
        search: debouncedSearch || undefined,
        method: methodFilter,
        plan: planFilter,
        page,
        page_size: 20,
      }),
    staleTime: 0,
  });

  const pendingCardsQuery = useQuery({
    queryKey: ["admin-payments-pending-cards"],
    queryFn: () => getAdminPayments({ status: "pending", page: 1, page_size: 6 }),
    staleTime: 0,
  });

  const invalidatePaymentCaches = () => {
    qc.invalidateQueries({ queryKey: ["admin-payments"] });
    qc.invalidateQueries({ queryKey: ["admin-payments-pending-cards"] });
    qc.invalidateQueries({ queryKey: ["admin-badge-counts"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAdminPayment(id),
    onSuccess: (res) => {
      const uid = confirmApprove?.user_id || res.user_id;
      setConfirmApprove(null);
      invalidatePaymentCaches();
      if (res.email_status === "failed") {
        setEmailWarning({
          userId: uid,
          message: `Payment approved and plan activated, but confirmation email failed: ${res.email_error || "SMTP error"}. You can resend it from the user's detail page.`,
        });
        toast.warning("Payment approved, but confirmation email failed.");
      } else {
        setEmailWarning(null);
        toast.success("Payment approved and plan activated.");
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError && err.status === 409) {
        toast.info("This payment has already been reviewed.");
        setConfirmApprove(null);
        invalidatePaymentCaches();
      } else {
        toast.error("Could not approve payment right now.");
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectAdminPayment(id, reason),
    onSuccess: (res) => {
      const uid = confirmReject?.user_id || res.user_id;
      setConfirmReject(null);
      setRejectReason("");
      invalidatePaymentCaches();
      if (res.email_status === "failed") {
        setEmailWarning({
          userId: uid,
          message: `Payment rejected, but notification email failed: ${res.email_error || "SMTP error"}. You can resend it from the user's detail page.`,
        });
        toast.warning("Payment rejected, but notification email failed.");
      } else {
        setEmailWarning(null);
        toast.success("Payment rejected.");
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError && err.status === 409) {
        toast.info("This payment has already been reviewed.");
        setConfirmReject(null);
        setRejectReason("");
        invalidatePaymentCaches();
      } else {
        toast.error("Could not reject payment right now.");
      }
    },
  });

  const recordMutation = useMutation({
    mutationFn: () => {
      if (!selectedUser) throw new Error("Select a user first.");
      const parsedAmount = recAmountUsd.trim() ? Number(recAmountUsd) : undefined;
      if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
        throw new Error("Enter a valid non-negative USD amount.");
      }
      return recordAdminPayment({
        user_id: selectedUser.id,
        plan_id: recPlanId,
        billing_interval: recInterval,
        amount_usd: parsedAmount,
        method: recMethod,
        transaction_id: recTxId.trim() || undefined,
        paid_at: recPaidAt.trim() || undefined,
        subscription_ends_at: recEndsAt.trim() || undefined,
        activate_plan: recActivate,
        send_email: recSendEmail,
        note: recNote.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      setRecordOpen(false);
      setRecError(null);
      invalidatePaymentCaches();
      qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
      if (res.email_status === "failed") {
        toast.warning("Payment recorded, but email failed.");
      } else {
        toast.success(`Payment ${res.transaction_id} recorded.`);
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Could not record payment.";
      setRecError(msg);
      toast.error(msg);
    },
  });

  const voidMutation = useMutation({
    mutationFn: () => {
      if (!voidTarget) throw new Error("No payment selected");
      return voidAdminPayment(voidTarget.id, {
        reason: voidReason.trim(),
        revoke_access: voidRevoke,
        send_email: voidSendEmail,
        user_message: voidMessage.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      setVoidTarget(null);
      setVoidReason("");
      setVoidMessage("");
      invalidatePaymentCaches();
      qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
      if (res.email_status === "failed") {
        setEmailWarning({
          userId: res.user_id,
          message: `Payment voided, but email failed: ${res.email_error || "SMTP error"}.`,
        });
        toast.warning("Payment voided, but email failed.");
      } else {
        toast.success("Payment voided.");
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not void payment.");
    },
  });

  const openRecordDialog = () => {
    const firstPaid = paidPlans[0]?.id || "starter";
    setSelectedUser(null);
    setUserSearch("");
    setRecPlanId(firstPaid);
    setRecInterval("monthly");
    setRecAmountUsd(defaultUsdFor(firstPaid, "monthly"));
    setRecMethod("manual");
    setRecTxId("");
    setRecPaidAt(new Date().toISOString().slice(0, 10));
    setRecEndsAt("");
    setRecActivate(true);
    setRecSendEmail(true);
    setRecNote("");
    setRecError(null);
    setRecordOpen(true);
  };

  const items = paymentsQuery.data?.items || [];
  const totalPages = paymentsQuery.data?.total_pages || 1;
  const total = paymentsQuery.data?.total ?? items.length;
  const pendingCount = paymentsQuery.data?.pending_count ?? overviewQuery.data?.kpis.pending_payments_count;
  const pendingCards = pendingCardsQuery.data?.items || [];

  const kpis = overviewQuery.data?.kpis;
  const activeFilters =
    (debouncedSearch ? 1 : 0) + (methodFilter !== "all" ? 1 : 0) + (planFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setMethodFilter("all");
    setPlanFilter("all");
    setPage(1);
  };

  const currentPeriodEnd = voidUserDetailQuery.data?.billing?.current_period_end;
  const voidPreviewEnd = voidTarget
    ? previewSubtractedEndDate(currentPeriodEnd, voidTarget.billing_interval)
    : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Verify checkout transactions, record manual payments, or void approved payments."
        actions={
          <>
            <AdminExportButton
              kind="payments"
              params={{
                status: tab,
                search: debouncedSearch || undefined,
                method: methodFilter,
                plan: planFilter,
              }}
            />
            <Button size="sm" onClick={openRecordDialog}>
              <Plus className="size-4 mr-1.5" />
              Record payment
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        {overviewQuery.isLoading ? (
          [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Pending review"
              value={pendingCount ?? 0}
              icon={Clock}
              tone="amber"
              subline={
                kpis ? `$${kpis.pending_payments_usd.toFixed(2)} waiting` : "Awaiting verification"
              }
            />
            <StatCard
              label="Revenue (UTC month)"
              value={kpis ? `$${kpis.revenue_month_usd.toFixed(2)}` : "—"}
              icon={DollarSign}
              tone="emerald"
              subline={kpis ? `Rs ${kpis.revenue_month_pkr.toLocaleString()}` : undefined}
            />
            <StatCard
              label="All-time approved"
              value={kpis ? `$${kpis.revenue_all_time_usd.toFixed(2)}` : "—"}
              icon={TrendingUp}
              tone="violet"
              subline="Total collected across plans"
            />
            <StatCard
              label="Filtered rows"
              value={total.toLocaleString()}
              icon={Wallet}
              tone="sky"
              subline={`Viewing ${tab === "all" ? "all statuses" : `${tab} status`}`}
            />
          </>
        )}
      </div>

      {emailWarning && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{emailWarning.message}</span>
            {emailWarning.userId && (
              <Link href={`/admin/users/${emailWarning.userId}`} className="underline font-medium">
                Open user detail
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {pendingCards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Pending verification ({pendingCards.length} shown)
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pendingCards.map((item) => (
              <Card
                key={item.id}
                className="rounded-lg border-amber-500/35 bg-card shadow-xs"
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar userId={item.user_id} email={item.user_email} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${item.user_id}`}
                          className="text-sm font-medium text-foreground hover:underline truncate block"
                        >
                          {item.user_email}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">
                          <RelativeTime iso={item.submitted_at} />
                        </div>
                      </div>
                    </div>
                    <StatusBadge kind="payment" value="pending" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <PlanBadge planId={item.plan_id} planName={item.plan_name} />
                      <span className="text-muted-foreground capitalize">
                        ({item.billing_interval})
                      </span>
                    </div>
                    <div className="font-semibold tabular-nums text-foreground">
                      ${item.amount_usd.toFixed(2)} · Rs {item.amount_pkr.toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <MethodBadge method={item.method} />
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-mono truncate">{item.transaction_id}</span>
                      <CopyButton
                        value={item.transaction_id}
                        label={`Copy ${item.transaction_id}`}
                        toastLabel="Transaction ID copied"
                        className="size-6"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      onClick={() => setConfirmApprove(item)}
                    >
                      <Check className="size-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300"
                      onClick={() => {
                        setRejectReason("");
                        setConfirmReject(item);
                      }}
                    >
                      <X className="size-3.5 mr-1" />
                      Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "pending" | "approved" | "rejected" | "voided" | "all");
          setPage(1);
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="pending" className="gap-1.5">
            Pending
            {typeof pendingCount === "number" && pendingCount > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[11px] tabular-nums bg-amber-500/15 text-amber-800 dark:text-amber-300"
              >
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="voided">Voided</TabsTrigger>
          <TabsTrigger value="all">All history</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {paymentsQuery.isError ? (
            <ErrorState
              title="Could not load payments"
              message="Failed to fetch payments list."
              onRetry={() => paymentsQuery.refetch()}
            />
          ) : (
            <DataTableShell
              title={tab === "all" ? "All payment history" : `${tab} payments`}
              description={
                tab === "pending"
                  ? `Approve or reject submitted transaction IDs (${total} matching).`
                  : `Showing ${items.length} of ${total} matching payment(s).`
              }
              toolbar={
                <Toolbar
                  searchValue={searchInput}
                  onSearchChange={setSearchInput}
                  searchPlaceholder="Search transaction ID or user email..."
                  activeFilterCount={activeFilters}
                  onClearAll={clearFilters}
                  filters={
                    <>
                      <Select
                        value={methodFilter}
                        onValueChange={(v) => {
                          setMethodFilter(v);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-40 h-9">
                          <SelectValue placeholder="Method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All methods</SelectItem>
                          <SelectItem value="easypaisa">Easypaisa</SelectItem>
                          <SelectItem value="jazzcash">JazzCash</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={planFilter}
                        onValueChange={(v) => {
                          setPlanFilter(v);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-36 h-9">
                          <SelectValue placeholder="Plan" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All plans</SelectItem>
                          {paidPlans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  }
                />
              }
              pagination={
                !paymentsQuery.isLoading && items.length > 0 ? (
                  <PaginationFooter
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    pageSize={20}
                    onPageChange={setPage}
                  />
                ) : undefined
              }
            >
              {paymentsQuery.isLoading ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableSkeleton columns={9} rows={6} />
                </Table>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No payments found"
                  description="No payments match the active status tab or filters."
                  action={
                    activeFilters > 0 ? (
                      <Button size="sm" variant="outline" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-2 min-w-[170px]">
                            <UserAvatar userId={item.user_id} email={item.user_email} size="xs" />
                            <Link
                              href={`/admin/users/${item.user_id}`}
                              className="hover:underline font-medium truncate max-w-[160px]"
                            >
                              {item.user_email}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <PlanBadge planId={item.plan_id} planName={item.plan_name} />
                            <span className="capitalize text-muted-foreground">
                              {item.billing_interval}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <MethodBadge method={item.method} />
                            {item.source === "manual" && (
                              <StatusBadge kind="payment" value="manual" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="payment" value={item.status} />
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <span className="font-mono">{item.transaction_id}</span>
                            <CopyButton
                              value={item.transaction_id}
                              label={`Copy ${item.transaction_id}`}
                              toastLabel="Transaction ID copied"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                          <div>${item.amount_usd.toFixed(2)}</div>
                          <div className="text-muted-foreground">
                            Rs {item.amount_pkr.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <RelativeTime iso={item.submitted_at} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {item.status === "voided"
                            ? item.void_reason || `Voided by ${item.voided_by || "admin"}`
                            : item.status === "rejected"
                              ? item.reject_reason || "—"
                              : item.note || item.reviewed_by || "—"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                          {item.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => setConfirmApprove(item)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300"
                                onClick={() => {
                                  setRejectReason("");
                                  setConfirmReject(item);
                                }}
                              >
                                Decline
                              </Button>
                            </>
                          )}
                          {item.status === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-destructive"
                              onClick={() => {
                                setVoidTarget(item);
                                setVoidReason("");
                                setVoidRevoke(true);
                                setVoidSendEmail(true);
                                setVoidMessage("");
                              }}
                            >
                              <Ban className="size-3 mr-1" />
                              Void
                            </Button>
                          )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataTableShell>
          )}
        </TabsContent>
      </Tabs>

      {/* Record Manual Payment Dialog */}
      <StandardDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        initialFocusRef={recordUserSearchRef}
        title="Record manual payment"
        description="Log a collected payment directly as approved and optionally activate the user's plan."
        icon={Wallet}
        tone="info"
        maxWidth="sm:max-w-3xl"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setRecordOpen(false)}
              disabled={recordMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={recordMutation.isPending || !selectedUser}
              onClick={() => recordMutation.mutate()}
            >
              {recordMutation.isPending ? "Saving..." : "Save payment"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="border-b border-border pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basics</p>
            </div>
            <div className="space-y-1.5">
              <Label className="whitespace-nowrap">User</Label>
              <Input
                ref={recordUserSearchRef}
                placeholder="Search by email or name"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              {selectedUser ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span>
                    Selected: <strong>{selectedUser.email}</strong>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedUser(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-md border border-border divide-y divide-border text-sm">
                  {userSearchQuery.isLoading ? (
                    <div className="p-2.5 text-muted-foreground">Searching users...</div>
                  ) : (userSearchQuery.data?.items || []).length === 0 ? (
                    <div className="p-2.5 text-muted-foreground">No matching users.</div>
                  ) : (
                    (userSearchQuery.data?.items || []).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUser(u)}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between"
                      >
                        <span className="font-medium truncate">{u.email}</span>
                        <PlanBadge planId={u.plan_id} planName={u.plan_name} />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="border-b border-border pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-4 gap-y-5">
              <div className="min-w-0 space-y-1.5">
                <Label className="whitespace-nowrap">Plan</Label>
                <Select
                  value={recPlanId}
                  onValueChange={(nextPlan) => {
                    setRecPlanId(nextPlan);
                    const nextPrice = defaultUsdFor(nextPlan, recInterval);
                    if (nextPrice) setRecAmountUsd(nextPrice);
                  }}
                >
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paidPlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="whitespace-nowrap">Interval</Label>
                <Select
                  value={recInterval}
                  onValueChange={(v) => {
                    const nextInt = v as "monthly" | "annual";
                    setRecInterval(nextInt);
                    const nextPrice = defaultUsdFor(recPlanId, nextInt);
                    if (nextPrice) setRecAmountUsd(nextPrice);
                  }}
                >
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="whitespace-nowrap">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={recAmountUsd}
                  onChange={(e) => setRecAmountUsd(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">USD.</p>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="whitespace-nowrap">Method</Label>
                <Select value={recMethod} onValueChange={setRecMethod}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="easypaisa">Easypaisa</SelectItem>
                    <SelectItem value="jazzcash">JazzCash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="whitespace-nowrap">Transaction ID</Label>
                <Input
                  value={recTxId}
                  onChange={(e) => setRecTxId(e.target.value)}
                  placeholder="Optional"
                />
                <p className="text-xs text-muted-foreground">Leave blank to auto-generate MANUAL-... ID.</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="border-b border-border pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscription</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-4 gap-y-5">
              <div className="min-w-0 space-y-1.5">
                <Label className="whitespace-nowrap">Paid date</Label>
                <Input type="date" value={recPaidAt} onChange={(e) => setRecPaidAt(e.target.value)} />
                <p className="text-xs text-muted-foreground">UTC.</p>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="whitespace-nowrap">End date override</Label>
                <Input type="date" value={recEndsAt} onChange={(e) => setRecEndsAt(e.target.value)} />
                <p className="text-xs text-muted-foreground">Optional. Format: YYYY-MM-DD.</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="border-b border-border pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features and access</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-4 gap-y-3">
              <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <span>Activate plan now</span>
                <Switch checked={recActivate} onCheckedChange={setRecActivate} />
              </label>
              <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                <span>Send approval email</span>
                <Switch checked={recSendEmail} onCheckedChange={setRecSendEmail} />
              </label>
            </div>
          </section>

          <section className="space-y-1.5">
            <Label className="whitespace-nowrap">Internal note</Label>
            <Input
              value={recNote}
              onChange={(e) => setRecNote(e.target.value)}
              placeholder="Optional"
            />
          </section>

          {recError && <p className="text-xs text-destructive">{recError}</p>}
        </div>
      </StandardDialog>

      {/* Void Payment Dialog */}
      <ConfirmDialog
        open={voidTarget !== null}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        maxWidth="sm:max-w-md"
        initialFocusRef={voidReasonRef}
        title="Void approved payment"
        description={
          <span>
            Void <span className="font-mono">{voidTarget?.transaction_id}</span> ($
            {voidTarget?.amount_usd.toFixed(2)}) for{" "}
            <span className="font-medium text-foreground">{voidTarget?.user_email}</span>.
          </span>
        }
        icon={Ban}
        summary="Voided payments are excluded from revenue totals, their transaction ID cannot be reused, and revoking subtracts the billing cycle from the user's period end (never earlier than now)."
        summaryTone="danger"
        destructive
        confirmLabel="Confirm void"
        isPending={voidMutation.isPending}
        disabled={voidReason.trim().length < 2}
        onConfirm={() => voidMutation.mutate()}
      >
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason (required)</Label>
          <Input
            ref={voidReasonRef}
            id="void-reason"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. Duplicate entry or refund"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3 gap-3 text-xs">
          <div>
            <div className="font-medium">Revoke added subscription time</div>
            <p className="text-muted-foreground mt-0.5">
              Subtracts {voidTarget?.billing_interval === "annual" ? "12 months" : "1 month"} from
              period end.
            </p>
            {voidRevoke && (
              <p className="text-foreground mt-1 font-medium">
                New end preview:{" "}
                {voidUserDetailQuery.isLoading ? "Calculating..." : voidPreviewEnd}
              </p>
            )}
          </div>
          <Switch checked={voidRevoke} onCheckedChange={setVoidRevoke} />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3 text-xs">
          <span>Notify user by email</span>
          <Switch checked={voidSendEmail} onCheckedChange={setVoidSendEmail} />
        </div>

        {voidSendEmail && (
          <div className="space-y-1.5">
            <Label htmlFor="void-msg">Optional message to user</Label>
            <Textarea
              id="void-msg"
              rows={2}
              value={voidMessage}
              onChange={(e) => setVoidMessage(e.target.value)}
            />
          </div>
        )}
      </ConfirmDialog>

      {/* Approve Confirm Dialog */}
      <ConfirmDialog
        open={confirmApprove !== null}
        onOpenChange={(o) => !o && setConfirmApprove(null)}
        maxWidth="sm:max-w-lg"
        title="Approve payment"
        description={
          <span>
            Activate <PlanBadge planId={confirmApprove?.plan_id || ""} planName={confirmApprove?.plan_name} /> for{" "}
            <span className="font-medium text-foreground">{confirmApprove?.user_email}</span>?
          </span>
        }
        icon={Check}
        summary="This marks the transaction approved, activates or extends the user's paid subscription window, clears entitlement caches, and sends a confirmation email."
        summaryTone="info"
        confirmLabel="Confirm approve"
        isPending={approveMutation.isPending}
        onConfirm={() => confirmApprove && approveMutation.mutate(confirmApprove.id)}
      >
        <div className="text-xs space-y-1.5 rounded-md border border-border p-3 bg-muted/30">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium tabular-nums">
              ${confirmApprove?.amount_usd.toFixed(2)} (Rs {confirmApprove?.amount_pkr.toLocaleString()})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Method</span>
            <MethodBadge method={confirmApprove?.method} />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Transaction ID</span>
            <span className="font-mono">{confirmApprove?.transaction_id}</span>
          </div>
        </div>
      </ConfirmDialog>

      {/* Reject Confirm Dialog with Preset Reasons */}
      <ConfirmDialog
        open={confirmReject !== null}
        onOpenChange={(o) => !o && setConfirmReject(null)}
        maxWidth="sm:max-w-lg"
        initialFocusRef={rejectReasonRef}
        title="Decline payment"
        description={
          <span>
            Decline payment from{" "}
            <span className="font-medium text-foreground">{confirmReject?.user_email}</span>?
          </span>
        }
        icon={X}
        summary="The payment will be marked rejected, its transaction ID can be resubmitted cleanly, and the user receives the rejection reason by email."
        summaryTone="warning"
        destructive
        confirmLabel="Confirm decline"
        isPending={rejectMutation.isPending}
        disabled={rejectReason.trim().length < 2}
        onConfirm={() =>
          confirmReject &&
          rejectMutation.mutate({ id: confirmReject.id, reason: rejectReason.trim() })
        }
      >
        <DialogCallout tone="info" title="Submitted transaction">
          <span className="font-mono">{confirmReject?.transaction_id}</span> · $
          {confirmReject?.amount_usd.toFixed(2)} (Rs {confirmReject?.amount_pkr.toLocaleString()})
        </DialogCallout>

        <div className="space-y-2">
          <Label>Quick presets</Label>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={rejectReason === preset ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setRejectReason(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reject-reason">Reason (required)</Label>
          <Input
            ref={rejectReasonRef}
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Transaction ID not found"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
