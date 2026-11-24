"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const [confirmApprove, setConfirmApprove] = React.useState<AdminPaymentItem | null>(null);
  const [confirmReject, setConfirmReject] = React.useState<AdminPaymentItem | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const paymentsQuery = useQuery({
    queryKey: ["admin-payments", tab],
    queryFn: () => getAdminPayments(tab),
    staleTime: 0,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAdminPayment(id),
    onSuccess: () => {
      toast.success("Payment approved and plan activated.");
      setConfirmApprove(null);
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
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
    onSuccess: () => {
      toast.success("Payment rejected.");
      setConfirmReject(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Verify manual Easypaisa and JazzCash transactions.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "approved" | "rejected")}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base capitalize">{tab} payments</CardTitle>
              <CardDescription>
                {tab === "pending"
                  ? "Approve or reject submitted transaction IDs."
                  : `Showing ${items.length} ${tab} payments.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsQuery.isLoading ? (
                <div className="h-32 rounded bg-muted/40 animate-pulse" />
              ) : paymentsQuery.isError ? (
                <p className="text-xs text-destructive">Could not load payments right now.</p>
              ) : items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No {tab} payments.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User email</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Interval</TableHead>
                        <TableHead>Amount (PKR)</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Transaction ID</TableHead>
                        <TableHead>Submitted</TableHead>
                        {tab === "pending" ? (
                          <TableHead className="text-right">Actions</TableHead>
                        ) : tab === "rejected" ? (
                          <TableHead>Reason</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs">{item.user_email}</TableCell>
                          <TableCell className="text-xs font-medium">{item.plan_name}</TableCell>
                          <TableCell className="text-xs capitalize">{item.billing_interval}</TableCell>
                          <TableCell className="text-xs tabular-nums">
                            Rs {item.amount_pkr.toLocaleString()}
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
                          ) : tab === "rejected" ? (
                            <TableCell className="text-xs text-muted-foreground">
                              {item.reject_reason || "-"}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
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
            <div>Amount: Rs {confirmApprove?.amount_pkr.toLocaleString()}</div>
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
            <div>Amount: Rs {confirmReject?.amount_pkr.toLocaleString()}</div>
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
