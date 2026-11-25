"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  Loader2,
  RotateCcw,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
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
  allowDeletedAccountResignup,
  ApiClientError,
  getAdminUsers,
  getDeletedAccounts,
} from "@/lib/api";
import type { AdminUserListItem, DeletedAccountItem } from "@/types/admin";
import {
  AccountStatusPill,
  UserDeleteModal,
  UserStatusModal,
} from "./UserActionModals";

function formatShortDate(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function PaymentStatePill({ state }: { state: string }) {
  if (state === "paid") return <Badge variant="secondary">paid</Badge>;
  if (state === "trial") return <Badge variant="outline">trial</Badge>;
  return (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      {state}
    </Badge>
  );
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"all" | "deleted">("all");

  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [paymentStateFilter, setPaymentStateFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState<"created_at" | "name" | "usage">("created_at");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);

  const [delSearchInput, setDelSearchInput] = React.useState("");
  const [delDebouncedSearch, setDelDebouncedSearch] = React.useState("");
  const [delPage, setDelPage] = React.useState(1);

  const [statusTarget, setStatusTarget] = React.useState<AdminUserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminUserListItem | null>(null);
  const [resignupTarget, setResignupTarget] = React.useState<DeletedAccountItem | null>(null);
  const [emailWarning, setEmailWarning] = React.useState<{
    userId: string;
    message: string;
  } | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDelDebouncedSearch(delSearchInput.trim());
      setDelPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [delSearchInput]);

  const usersQuery = useQuery({
    queryKey: [
      "admin-users",
      debouncedSearch,
      planFilter,
      statusFilter,
      paymentStateFilter,
      sortBy,
      sortOrder,
      page,
    ],
    queryFn: () =>
      getAdminUsers({
        search: debouncedSearch || undefined,
        plan: planFilter,
        status: statusFilter,
        payment_state: paymentStateFilter,
        sort: sortBy,
        order: sortOrder,
        page,
      }),
    enabled: tab === "all",
    staleTime: 0,
  });

  const deletedQuery = useQuery({
    queryKey: ["admin-deleted-accounts", delDebouncedSearch, delPage],
    queryFn: () => getDeletedAccounts(delDebouncedSearch || undefined, delPage),
    enabled: tab === "deleted",
    staleTime: 0,
  });

  const resignupMutation = useMutation({
    mutationFn: (email: string) => allowDeletedAccountResignup(email),
    onSuccess: (res) => {
      toast.success(`${res.email} can now sign up again.`);
      setResignupTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-deleted-accounts"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not remove deleted account entry.");
    },
  });

  const items = usersQuery.data?.items || [];
  const totalPages = usersQuery.data?.total_pages || 1;
  const totalUsers = usersQuery.data?.total ?? 0;
  const delItems = deletedQuery.data?.items || [];
  const delTotalPages = deletedQuery.data?.total_pages || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage user accounts, inspect usage, suspend or reactivate access, and review deleted emails.
        </p>
      </div>

      {emailWarning && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="size-4 text-amber-600" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{emailWarning.message}</span>
            <Link href={`/admin/users/${emailWarning.userId}`} className="underline font-medium">
              Open user detail
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "deleted")}>
        <TabsList>
          <TabsTrigger value="all">All users</TabsTrigger>
          <TabsTrigger value="deleted">Deleted accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name or email..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All plans</SelectItem>
                    <SelectItem value="trial">Free trial</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Account status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={paymentStateFilter} onValueChange={(v) => { setPaymentStateFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Payment state" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All billing states</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={`${sortBy}:${sortOrder}`}
                  onValueChange={(v) => {
                    const [s, o] = v.split(":") as ["created_at" | "name" | "usage", "asc" | "desc"];
                    setSortBy(s);
                    setSortOrder(o);
                    setPage(1);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at:desc">Newest first</SelectItem>
                    <SelectItem value="created_at:asc">Oldest first</SelectItem>
                    <SelectItem value="name:asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name:desc">Name (Z-A)</SelectItem>
                    <SelectItem value="usage:desc">Highest usage</SelectItem>
                    <SelectItem value="usage:asc">Lowest usage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Directory</CardTitle>
              <CardDescription>{totalUsers} total user{totalUsers === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[160px]">Monthly usage</TableHead>
                    <TableHead>LinkedIn</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        <Loader2 className="inline size-4 animate-spin mr-2" />
                        Loading users...
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        No users match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{u.name}</span>
                            {u.is_admin && (
                              <Badge variant="secondary" className="gap-1 text-xs">
                                <Shield className="size-3" />
                                Admin
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{u.plan_name}</span>
                            <PaymentStatePill state={u.payment_state} />
                          </div>
                        </TableCell>
                        <TableCell><AccountStatusPill status={u.account_status} /></TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {u.monthly_usage_used}
                                {u.monthly_usage_limit !== null ? ` / ${u.monthly_usage_limit}` : " (unlimited)"}
                              </span>
                              {u.monthly_usage_limit !== null && <span>{u.monthly_usage_percent}%</span>}
                            </div>
                            {u.monthly_usage_limit !== null && (
                              <Progress value={u.monthly_usage_percent} className="h-1.5" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.linkedin_connected ? (
                            <div>
                              <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                                Yes
                              </Badge>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Exp {formatShortDate(u.linkedin_expires_at)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatShortDate(u.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" asChild title="View user details">
                              <Link href={`/admin/users/${u.id}`} aria-label={`View ${u.email}`}>
                                <Eye className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={u.is_admin}
                              title={
                                u.is_admin
                                  ? "Protected admin account"
                                  : u.account_status === "active"
                                    ? "Suspend or disable user"
                                    : "Reactivate user"
                              }
                              aria-label={u.account_status === "active" ? `Suspend ${u.email}` : `Reactivate ${u.email}`}
                              onClick={() => setStatusTarget(u)}
                            >
                              {u.account_status === "active" ? (
                                <Ban className="size-4" />
                              ) : (
                                <CheckCircle2 className="size-4 text-emerald-600" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={u.is_admin}
                              title={u.is_admin ? "Protected admin account" : "Delete user"}
                              aria-label={`Delete ${u.email}`}
                              onClick={() => setDeleteTarget(u)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="deleted" className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search deleted email..."
                  value={delSearchInput}
                  onChange={(e) => setDelSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Deleted accounts</CardTitle>
              <CardDescription>Emails listed here are blocked from signing up again until removed.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Deleted by</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Deleted at</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletedQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        <Loader2 className="inline size-4 animate-spin mr-2" />
                        Loading deleted accounts...
                      </TableCell>
                    </TableRow>
                  ) : delItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        No deleted accounts found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    delItems.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium text-sm">{d.email}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.deleted_by}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{d.reason || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatShortDate(d.deleted_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => setResignupTarget(d)}>
                            <RotateCcw className="size-3.5 mr-1.5" />
                            Allow sign-up
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {delPage} of {delTotalPages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={delPage <= 1} onClick={() => setDelPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={delPage >= delTotalPages} onClick={() => setDelPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {statusTarget && (
        <UserStatusModal
          open={Boolean(statusTarget)}
          onOpenChange={(o) => !o && setStatusTarget(null)}
          userId={statusTarget.id}
          userEmail={statusTarget.email}
          currentStatus={statusTarget.account_status}
          onCompleted={(res) => {
            if (res.email_status === "failed") {
              setEmailWarning({
                userId: res.userId,
                message: `Status updated to ${res.account_status}, but notification email failed: ${res.email_error || "SMTP error"}. You can resend it from the user's detail page.`,
              });
            } else {
              setEmailWarning(null);
            }
          }}
        />
      )}

      {deleteTarget && (
        <UserDeleteModal
          open={Boolean(deleteTarget)}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          userId={deleteTarget.id}
          userEmail={deleteTarget.email}
        />
      )}

      <Dialog open={Boolean(resignupTarget)} onOpenChange={(o) => !o && setResignupTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allow sign-up again</DialogTitle>
            <DialogDescription>
              Remove {resignupTarget?.email} from the deleted accounts blocklist so they can register a new account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResignupTarget(null)}>Cancel</Button>
            <Button
              disabled={resignupMutation.isPending || !resignupTarget}
              onClick={() => resignupTarget && resignupMutation.mutate(resignupTarget.email)}
            >
              {resignupMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Allow sign-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
