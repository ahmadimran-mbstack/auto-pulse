"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  RotateCcw,
  Trash2,
  UserX,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AdminExportButton } from "@/components/admin/export-button";
import {
  ConfirmDialog,
  DataTableShell,
  EmptyState,
  ErrorState,
  PageHeader,
  PaginationFooter,
  PlanBadge,
  RelativeTime,
  RoleBadge,
  StatusBadge,
  TableSkeleton,
  Toolbar,
  UsageBar,
  UserAvatar,
} from "@/components/admin/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  allowDeletedAccountResignup,
  ApiClientError,
  getAdminPlansOverview,
  getAdminUsers,
  getDeletedAccounts,
} from "@/lib/api";
import type { AdminUserListItem, DeletedAccountItem } from "@/types/admin";
import { UserDeleteModal, UserStatusModal } from "./UserActionModals";

export default function AdminUsersPage() {
  const router = useRouter();
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
  const [pageSize, setPageSize] = React.useState(12);

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

  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: getAdminPlansOverview,
    staleTime: 60_000,
  });
  const allPlans = plansQuery.data?.plans || [];

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
      pageSize,
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
        page_size: pageSize,
      }),
    enabled: tab === "all",
    staleTime: 0,
  });

  const deletedQuery = useQuery({
    queryKey: ["admin-deleted-accounts", delDebouncedSearch, delPage],
    queryFn: () => getDeletedAccounts(delDebouncedSearch || undefined, delPage),
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
      toast.error(
        err instanceof ApiClientError ? err.message : "Could not remove deleted account entry."
      );
    },
  });

  const items = usersQuery.data?.items || [];
  const totalPages = usersQuery.data?.total_pages || 1;
  const totalUsers = usersQuery.data?.total ?? 0;

  const delItems = deletedQuery.data?.items || [];
  const delTotalPages = deletedQuery.data?.total_pages || 1;
  const totalDeleted = deletedQuery.data?.total ?? 0;

  const activeFilters =
    (debouncedSearch ? 1 : 0) +
    (planFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (paymentStateFilter !== "all" ? 1 : 0);

  const clearAllFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setPlanFilter("all");
    setStatusFilter("all");
    setPaymentStateFilter("all");
    setSortBy("created_at");
    setSortOrder("desc");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage user accounts, inspect usage, suspend or reactivate access, and review deleted emails."
        actions={
          <AdminExportButton
            kind="users"
            params={{
              search: debouncedSearch || undefined,
              plan: planFilter,
              status: statusFilter,
              payment_state: paymentStateFilter,
              sort: sortBy,
              order: sortOrder,
            }}
          />
        }
      />

      {emailWarning && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
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
          <TabsTrigger value="all" className="gap-1.5">
            All users
            {usersQuery.data && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
                {totalUsers.toLocaleString()}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="deleted" className="gap-1.5">
            Deleted accounts
            {deletedQuery.data && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
                {totalDeleted.toLocaleString()}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-4">
          {usersQuery.isError ? (
            <ErrorState
              title="Could not load users"
              message="Failed to fetch the user directory."
              onRetry={() => usersQuery.refetch()}
            />
          ) : (
            <DataTableShell
              toolbar={
                <Toolbar
                  searchValue={searchInput}
                  onSearchChange={setSearchInput}
                  searchPlaceholder="Search name or email..."
                  activeFilterCount={activeFilters}
                  onClearAll={clearAllFilters}
                  filters={
                    <>
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
                          {allPlans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={statusFilter}
                        onValueChange={(v) => {
                          setStatusFilter(v);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-36 h-9">
                          <SelectValue placeholder="Account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={paymentStateFilter}
                        onValueChange={(v) => {
                          setPaymentStateFilter(v);
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-40 h-9">
                          <SelectValue placeholder="Billing state" />
                        </SelectTrigger>
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
                        <SelectTrigger className="w-40 h-9">
                          <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created_at:desc">Newest first</SelectItem>
                          <SelectItem value="created_at:asc">Oldest first</SelectItem>
                          <SelectItem value="name:asc">Name (A-Z)</SelectItem>
                          <SelectItem value="name:desc">Name (Z-A)</SelectItem>
                          <SelectItem value="usage:desc">Highest usage</SelectItem>
                          <SelectItem value="usage:asc">Lowest usage</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  }
                />
              }
              pagination={
                !usersQuery.isLoading && items.length > 0 ? (
                  <PaginationFooter
                    page={page}
                    totalPages={totalPages}
                    total={totalUsers}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(sz) => {
                      setPageSize(sz);
                      setPage(1);
                    }}
                    pageSizeOptions={[12, 24, 50]}
                  />
                ) : undefined
              }
            >
              {usersQuery.isLoading ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Monthly usage</TableHead>
                      <TableHead>LinkedIn</TableHead>
                      <TableHead>Signed up</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableSkeleton columns={8} rows={6} />
                </Table>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={UsersIcon}
                  title="No users match your filters"
                  description="Try clearing search keywords or switching plan and status filters."
                  action={
                    activeFilters > 0 ? (
                      <Button size="sm" variant="outline" onClick={clearAllFilters}>
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
                      <TableHead>Account</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead className="min-w-[170px]">Monthly usage</TableHead>
                      <TableHead>LinkedIn</TableHead>
                      <TableHead>Signed up</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((u) => (
                      <TableRow
                        key={u.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/admin/users/${u.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-[200px]">
                            <UserAvatar userId={u.id} name={u.name} email={u.email} size="sm" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm text-foreground truncate max-w-[160px]">
                                  {u.name}
                                </span>
                                {u.is_admin && <RoleBadge />}
                              </div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <PlanBadge planId={u.plan_id} planName={u.plan_name} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="account" value={u.account_status} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge kind="subscription" value={u.payment_state} />
                        </TableCell>
                        <TableCell>
                          <UsageBar
                            used={u.monthly_usage_used}
                            limit={u.monthly_usage_limit}
                            compact
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <StatusBadge
                              kind="connection"
                              value={u.linkedin_connected ? "connected" : "not_linked"}
                            />
                            {u.linkedin_connected && u.linkedin_expires_at && (
                              <div className="text-[11px] text-muted-foreground pl-1">
                                Exp <RelativeTime iso={u.linkedin_expires_at} />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <RelativeTime iso={u.created_at} />
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" asChild>
                                  <Link href={`/admin/users/${u.id}`} aria-label={`View ${u.email}`}>
                                    <Eye className="size-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View details</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  disabled={u.is_admin}
                                  aria-label={
                                    u.account_status === "active"
                                      ? `Suspend ${u.email}`
                                      : `Reactivate ${u.email}`
                                  }
                                  onClick={() => setStatusTarget(u)}
                                >
                                  {u.account_status === "active" ? (
                                    <Ban className="size-4" />
                                  ) : (
                                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {u.is_admin
                                  ? "Protected admin account"
                                  : u.account_status === "active"
                                    ? "Suspend or disable user"
                                    : "Reactivate user"}
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-destructive hover:text-destructive"
                                  disabled={u.is_admin}
                                  aria-label={`Delete ${u.email}`}
                                  onClick={() => setDeleteTarget(u)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {u.is_admin ? "Protected admin account" : "Delete user"}
                              </TooltipContent>
                            </Tooltip>
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

        <TabsContent value="deleted" className="mt-4 space-y-4">
          {deletedQuery.isError ? (
            <ErrorState
              title="Could not load deleted accounts"
              message="Failed to fetch the blocked email list."
              onRetry={() => deletedQuery.refetch()}
            />
          ) : (
            <DataTableShell
              title="Deleted accounts blocklist"
              description="Emails listed here cannot register again until removed."
              toolbar={
                <Toolbar
                  searchValue={delSearchInput}
                  onSearchChange={setDelSearchInput}
                  searchPlaceholder="Search deleted email..."
                />
              }
              pagination={
                !deletedQuery.isLoading && delItems.length > 0 ? (
                  <PaginationFooter
                    page={delPage}
                    totalPages={delTotalPages}
                    total={totalDeleted}
                    pageSize={20}
                    onPageChange={setDelPage}
                  />
                ) : undefined
              }
            >
              {deletedQuery.isLoading ? (
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
                  <TableSkeleton columns={5} rows={5} />
                </Table>
              ) : delItems.length === 0 ? (
                <EmptyState
                  icon={UserX}
                  title="No deleted accounts"
                  description="Removed user emails blocked from re-signup will appear here."
                />
              ) : (
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
                    {delItems.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium text-sm">{d.email}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.deleted_by}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {d.reason || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <RelativeTime iso={d.deleted_at} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => setResignupTarget(d)}>
                            <RotateCcw className="size-3.5 mr-1.5" />
                            Allow sign-up
                          </Button>
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

      <ConfirmDialog
        open={Boolean(resignupTarget)}
        onOpenChange={(o) => !o && setResignupTarget(null)}
        maxWidth="sm:max-w-md"
        title="Allow sign-up again"
        description={
          <span>
            Remove <span className="font-medium text-foreground">{resignupTarget?.email}</span> from
            the deleted accounts blocklist.
          </span>
        }
        icon={RotateCcw}
        summary="Removing this email from the blocklist lets the person create a new account under this address."
        summaryTone="info"
        confirmLabel="Allow sign-up"
        isPending={resignupMutation.isPending}
        onConfirm={() => resignupTarget && resignupMutation.mutate(resignupTarget.email)}
      />
    </div>
  );
}
