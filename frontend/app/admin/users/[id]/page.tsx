"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  History,
  Layers,
  Link2,
  Mail,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  CopyButton,
  DataTableShell,
  DaysLeftChip,
  EmptyState,
  ErrorState,
  MethodBadge,
  PlanBadge,
  RelativeTime,
  RoleBadge,
  StatCardSkeleton,
  StatusBadge,
  UsageBar,
  UserAvatar,
} from "@/components/admin/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  downloadAdminUserExport,
  getAdminUserDetail,
  resendUserNotification,
} from "@/lib/api";
import {
  ChangePlanModal,
  SetEndDateModal,
  UserDeleteModal,
  UserStatusModal,
} from "../UserActionModals";

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const userId = params?.id || "";

  const detailQuery = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => getAdminUserDetail(userId),
    enabled: Boolean(userId),
    staleTime: 0,
    refetchInterval: (query) => {
      const logs = query.state.data?.email_logs;
      if (logs?.some((e) => e.status === "queued" || e.status === "sending")) {
        return 2000;
      }
      return false;
    },
  });

  const [statusOpen, setStatusOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [endDateOpen, setEndDateOpen] = React.useState(false);
  const [emailErrorBanner, setEmailErrorBanner] = React.useState<string | null>(null);

  const resendMutation = useMutation({
    mutationFn: (logId: string) => resendUserNotification(userId, logId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      if (res.status === "sent") {
        toast.success("Email resent successfully.");
      } else if (res.status === "queued") {
        toast.info("Email queued for delivery.");
      } else {
        toast.error(`Resend failed: ${res.error || "Delivery error"}`);
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not resend email.");
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/users">
            <ArrowLeft className="size-4 mr-1.5" />
            Back to users
          </Link>
        </Button>
        <ErrorState
          title="Could not load user"
          message="This user could not be found or loaded."
          onRetry={() => detailQuery.refetch()}
        />
      </div>
    );
  }

  const { summary, billing, quota, connections, runs, payments, email_logs, audit_logs } =
    detailQuery.data;

  const activeEnd = billing.plan_id === "trial" ? billing.trial_ends_at : billing.current_period_end;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground" asChild>
            <Link href="/admin/users">
              <ArrowLeft className="size-4 mr-1.5" />
              Back to users
            </Link>
          </Button>

          <div className="flex items-start gap-3.5">
            <UserAvatar userId={summary.id} name={summary.name} email={summary.email} size="lg" />
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
                  {summary.name}
                </h1>
                <StatusBadge kind="account" value={summary.account_status} />
                {summary.is_admin && <RoleBadge />}
                <PlanBadge planId={billing.plan_id} planName={billing.plan_name} />
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="text-foreground">{summary.email}</span>
                  <CopyButton
                    value={summary.email}
                    label="Copy email"
                    toastLabel="Email copied"
                    className="size-6"
                  />
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 font-mono">
                  <span>{summary.id}</span>
                  <CopyButton
                    value={summary.id}
                    label="Copy user ID"
                    toastLabel="User ID copied"
                    className="size-6"
                  />
                </span>
                <span>•</span>
                <span>
                  Signed up <RelativeTime iso={summary.created_at} />
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await downloadAdminUserExport(userId);
                toast.success("User JSON exported.");
              } catch (err) {
                toast.error(err instanceof ApiClientError ? err.message : "Export failed.");
              }
            }}
          >
            <Download className="size-4 mr-1.5" />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
            <Layers className="size-4 mr-1.5" />
            Change plan
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEndDateOpen(true)}>
            <Calendar className="size-4 mr-1.5" />
            Set end date
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={summary.is_admin}
            onClick={() => setStatusOpen(true)}
          >
            {summary.account_status === "active" ? (
              <>
                <Ban className="size-4 mr-1.5" />
                Suspend / Disable
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                Reactivate
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={summary.is_admin}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4 mr-1.5" />
            Delete user
          </Button>
        </div>
      </div>

      {emailErrorBanner && (
        <Alert className="border-red-500/35 bg-red-500/10 text-red-900 dark:text-red-200">
          <AlertDescription>{emailErrorBanner}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-lg border-border bg-card shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">Plan &amp; Billing</CardTitle>
              <CardDescription>Current entitlement state</CardDescription>
            </div>
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <CreditCard className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Plan</span>
              <div className="flex items-center gap-1.5">
                <PlanBadge planId={billing.plan_id} planName={billing.plan_name} />
                {billing.billing_interval && (
                  <Badge variant="outline" className="capitalize text-[11px]">
                    {billing.billing_interval}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge kind="subscription" value={billing.subscription_status} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Period end</span>
              <div className="flex items-center gap-1.5">
                <RelativeTime iso={activeEnd} />
                {activeEnd && <DaysLeftChip endDateIso={activeEnd} />}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Cycle start</span>
              <RelativeTime iso={billing.current_period_start} />
            </div>
            {summary.status_reason && (
              <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                Status note: {summary.status_reason} ({summary.status_changed_by || "admin"})
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border bg-card shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">Quota Usage</CardTitle>
              <CardDescription>Current billing window</CardDescription>
            </div>
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <Activity className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs">
            <UsageBar
              label="Scheduled posts"
              used={quota.scheduled_used}
              limit={quota.scheduled_limit}
            />
            <UsageBar
              label="Playground (period)"
              used={quota.playground_used}
              limit={quota.playground_limit}
            />
            <UsageBar
              label="Doc tokens"
              used={quota.docs_tokens_used}
              limit={quota.docs_token_limit}
            />
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border bg-card shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold">Connections</CardTitle>
              <CardDescription>LinkedIn &amp; Slack integrations</CardDescription>
            </div>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <Link2 className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-md border border-border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">LinkedIn</span>
                <StatusBadge
                  kind="connection"
                  value={connections.linkedin.connected ? "connected" : connections.linkedin.status}
                />
              </div>
              <div className="text-muted-foreground">
                {connections.linkedin.account_name || "No account"} · Expires{" "}
                <RelativeTime iso={connections.linkedin.expires_at} />
              </div>
            </div>

            <div className="rounded-md border border-border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Slack</span>
                <StatusBadge
                  kind="connection"
                  value={connections.slack.connected ? "connected" : connections.slack.status}
                />
              </div>
              <div className="text-muted-foreground">
                {connections.slack.team_name || "No workspace connected"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activity">
        <TabsList className="flex-wrap">
          <TabsTrigger value="activity" className="gap-1.5">
            Activity
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
              {runs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            Payments
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
              {payments.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            Notifications
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
              {email_logs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            Audit
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
              {audit_logs.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <DataTableShell title="Recent pipeline runs" description="Latest generation and workflow runs">
            {runs.length === 0 ? (
              <EmptyState icon={Activity} title="No pipeline runs yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tokens (in / out)</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <RelativeTime iso={r.started_at} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.run_type} <span className="text-muted-foreground">({r.usage_kind})</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="run" value={r.status} />
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                        {r.tokens_in.toLocaleString()} / {r.tokens_out.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-right tabular-nums">
                        ${r.cost_usd.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {r.error_code ? `${r.error_code}: ${r.error_detail || ""}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataTableShell>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <DataTableShell title="Payments" description="Transactions submitted or recorded for this account">
            {payments.length === 0 ? (
              <EmptyState icon={CreditCard} title="No payments submitted" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <RelativeTime iso={p.submitted_at} />
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <PlanBadge planId={p.plan_id} />
                          <span className="capitalize text-muted-foreground">
                            ({p.billing_interval})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <MethodBadge method={p.method} />
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{p.transaction_id}</span>
                          <CopyButton
                            value={p.transaction_id}
                            label={`Copy ${p.transaction_id}`}
                            toastLabel="Transaction ID copied"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums whitespace-nowrap">
                        ${p.amount_usd.toFixed(2)} / Rs {p.amount_pkr.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="payment" value={p.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataTableShell>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <DataTableShell
            title="Email notification logs"
            description="Transactional emails sent to this user with delivery status"
          >
            {email_logs.length === 0 ? (
              <EmptyState icon={Mail} title="No notification emails logged" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {email_logs.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <RelativeTime iso={e.created_at} />
                      </TableCell>
                      <TableCell className="text-xs font-medium">{e.type}</TableCell>
                      <TableCell>
                        <StatusBadge kind="email" value={e.status} />
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{e.attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {e.error || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {(e.status === "failed" || e.status === "unknown") && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resendMutation.isPending}
                            onClick={() => resendMutation.mutate(e.id)}
                          >
                            <RefreshCw
                              className={`size-3.5 mr-1.5 ${resendMutation.isPending ? "motion-safe:animate-spin" : ""}`}
                            />
                            Resend
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataTableShell>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DataTableShell title="Admin audit logs" description="Actions recorded against this account">
            {audit_logs.length === 0 ? (
              <EmptyState icon={History} title="No audit events recorded" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit_logs.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        <RelativeTime iso={a.created_at} />
                      </TableCell>
                      <TableCell className="text-xs">{a.actor_email}</TableCell>
                      <TableCell className="text-xs">
                        <StatusBadge kind="run" value={a.action} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {a.reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataTableShell>
        </TabsContent>
      </Tabs>

      <UserStatusModal
        open={statusOpen}
        onOpenChange={setStatusOpen}
        userId={summary.id}
        userEmail={summary.email}
        currentStatus={summary.account_status}
      />

      <UserDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        userId={summary.id}
        userEmail={summary.email}
        onDeleted={() => router.push("/admin/users")}
      />

      <ChangePlanModal
        open={planOpen}
        onOpenChange={setPlanOpen}
        userId={summary.id}
        userEmail={summary.email}
        currentPlanId={billing.plan_id}
        currentInterval={billing.billing_interval}
        isAdminUser={summary.is_admin}
        onCompleted={(res) => {
          if (res.email_status === "failed") {
            setEmailErrorBanner(
              `Plan changed to ${res.plan_name}, but email failed: ${res.email_error || "SMTP error"}. You can resend it under Notifications.`
            );
          } else {
            setEmailErrorBanner(null);
          }
        }}
      />

      <SetEndDateModal
        open={endDateOpen}
        onOpenChange={setEndDateOpen}
        userId={summary.id}
        userEmail={summary.email}
        currentEndIso={
          billing.plan_id === "trial" ? billing.trial_ends_at : billing.current_period_end
        }
      />
    </div>
  );
}
