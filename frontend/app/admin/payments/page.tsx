"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ApiClientError,
  approveAdminPayment,
  getAdminPayments,
  rejectAdminPayment,
} from "@/lib/api";
import type { AdminPaymentItem } from "@/types/plans";

export default function AdminPaymentsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"pending" | "approved" | "rejected">("pending");
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState("all");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);

  const [confirmApprove, setConfirmApprove] = React.useState<AdminPaymentItem | null>(null);
  const [confirmReject, setConfirmReject] = React.useState<AdminPaymentItem | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [emailWarning, setEmailWarning] = React.useState<{
    userId?: string;
    message: string;
  } | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

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

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAdminPayment(id),
    onSuccess: (res) => {
      const uid = confirmApprove?.user_id || res.user_id;
      setConfirmApprove(null);
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
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
        qc.invalidateQueries({ queryKey: ["admin-payments"] });
      } else {
        toast.error("Could not approve payment right now.");
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectAdminPayment(id, reason),
    onSuccess: (res) => {
      const uid = confirmReject?.user_id || res.user_id;
      setConfirmReject(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
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
        qc.invalidateQueries({ queryKey: ["admin-payments"] });
      } else {
        toast.error("Could not reject payment right now.");
      }
    },
  });

  const handleCopyTx = async (tx: string) => {
    await navigator.clipboard.writeText(tx);
    setCopiedId(tx);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const items = paymentsQuery.data?.items || [];
  const totalPages = paymentsQuery.data?.total_pages || 1;
  const total = paymentsQuery.data?.total ?? items.length;
  const pendingCount = paymentsQuery.data?.pending_count;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Verify manual Easypaisa and JazzCash transactions.
        </p>
      </div>

      {emailWarning && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="size-4 text-amber-600" />
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

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "pending" | "approved" | "rejected");
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending
            {typeof pendingCount === "number" && pendingCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search transaction ID or user email..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={methodFilter}
                  onValueChange={(v) => {
                    setMethodFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All methods</SelectItem>
                    <SelectItem value="easypaisa">Easypaisa</SelectItem>
                    <SelectItem value="jazzcash">JazzCash</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={planFilter}
                  onValueChange={(v) => {
                    setPlanFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All plans</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base capitalize">{tab} payments</CardTitle>
              <CardDescription>
                {tab === "pending"
                  ? `Approve or reject submitted transaction IDs (${total} matching).`
                  : `Showing ${items.length} of ${total} ${tab} payments.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {paymentsQuery.isLoading ? (
                <div className="p-6">
                  <div className="h-32 rounded bg-muted/40 animate-pulse" />
                </div>
              ) : paymentsQuery.isError ? (
                <p className="p-6 text-xs text-destructive">Could not load payments right now.</p>
              ) : items.length === 0 ? (
                <p className="p-6 text-xs text-muted-foreground">No {tab} payments.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User email</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Interval</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Submitted</TableHead>
                      {tab === "pending" ? (
                        <TableHead className="text-right">Actions</TableHead>
                      ) : tab === "approved" ? (
                        <TableHead>Reviewed by</TableHead>
                      ) : (
                        <TableHead>Reason</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">
                          <Link
                            href={`/admin/users/${item.user_id}`}
                            className="hover:underline font-medium"
                          >
                            {item.user_email}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.plan_name}</TableCell>
                        <TableCell className="text-xs capitalize">{item.billing_interval}</TableCell>
                        <TableCell className="text-xs tabular-nums whitespace-nowrap">
                          ${item.amount_usd.toFixed(2)} / Rs {item.amount_pkr.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{item.method}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono">{item.transaction_id}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyTx(item.transaction_id)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Copy transaction ID"
                            >
                              {copiedId === item.transaction_id ? (
                                <Check className="size-3.5 text-primary" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {item.submitted_at
                            ? new Date(item.submitted_at).toLocaleString()
                            : "-"}
                        </TableCell>
                        {tab === "pending" ? (
                          <TableCell className="text-right space-x-2 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs"
                              onClick={() => setConfirmApprove(item)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setRejectReason("");
                                setConfirmReject(item);
                              }}
                            >
                              Reject
                            </Button>
                          </TableCell>
                        ) : tab === "approved" ? (
                          <TableCell className="text-xs text-muted-foreground">
                            {item.reviewed_by || "-"}
                          </TableCell>
                        ) : (
                          <TableCell className="text-xs text-muted-foreground">
                            {item.reject_reason || "-"}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Approve confirm dialog */}
      <Dialog open={confirmApprove !== null} onOpenChange={(o) => !o && setConfirmApprove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve payment</DialogTitle>
            <DialogDescription>
              Activate <Badge variant="secondary">{confirmApprove?.plan_name}</Badge> for{" "}
              <span className="font-medium text-foreground">{confirmApprove?.user_email}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs space-y-1.5 rounded-md border border-border p-3 bg-muted/30">
            <div>
              Amount: ${confirmApprove?.amount_usd.toFixed(2)} (Rs {confirmApprove?.amount_pkr.toLocaleString()})
            </div>
            <div>Method: <span className="capitalize">{confirmApprove?.method}</span></div>
            <div>
              Transaction ID: <span className="font-mono">{confirmApprove?.transaction_id}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApprove(null)}>
              Cancel
            </Button>
            <Button
              disabled={approveMutation.isPending}
              onClick={() => confirmApprove && approveMutation.mutate(confirmApprove.id)}
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Approving...
                </>
              ) : (
                "Confirm approve"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirm dialog */}
      <Dialog open={confirmReject !== null} onOpenChange={(o) => !o && setConfirmReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payment</DialogTitle>
            <DialogDescription>
              Reject payment from{" "}
              <span className="font-medium text-foreground">{confirmReject?.user_email}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs space-y-1.5 rounded-md border border-border p-3 bg-muted/30">
            <div>
              Amount: ${confirmReject?.amount_usd.toFixed(2)} (Rs {confirmReject?.amount_pkr.toLocaleString()})
            </div>
            <div>Method: <span className="capitalize">{confirmReject?.method}</span></div>
            <div>
              Transaction ID: <span className="font-mono">{confirmReject?.transaction_id}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Transaction ID not found"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending || rejectReason.trim().length < 2}
              onClick={() =>
                confirmReject &&
                rejectMutation.mutate({ id: confirmReject.id, reason: rejectReason.trim() })
              }
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Rejecting...
                </>
              ) : (
                "Confirm reject"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
