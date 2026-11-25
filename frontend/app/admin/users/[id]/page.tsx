"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Calendar, CheckCircle2, Layers, Loader2, RefreshCw, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiClientError,
  getAdminUserDetail,
  resendUserNotification,
} from "@/lib/api";
import {
  AccountStatusPill,
  ChangePlanModal,
  SetEndDateModal,
  UserDeleteModal,
  UserStatusModal,
} from "../UserActionModals";

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

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
      } else {
        toast.error(`Resend failed: ${res.error || "SMTP error"}`);
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not resend email.");
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="inline size-4 animate-spin mr-2" />
        Loading user details...
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
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            User not found or could not be loaded.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, billing, quota, connections, runs, payments, email_logs, audit_logs } =
    detailQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
            <Link href="/admin/users">
              <ArrowLeft className="size-4 mr-1.5" />
              Back to users
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{summary.name}</h1>
            <AccountStatusPill status={summary.account_status} />
            {summary.is_admin && (
              <Badge variant="secondary" className="gap-1">
                <Shield className="size-3" />
                Admin
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {summary.email} · Signed up {formatDateTime(summary.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
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
                <CheckCircle2 className="size-4 mr-1.5" />
                Reactivate
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            disabled={summary.is_admin}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4 mr-1.5" />
            Delete user
          </Button>
        </div>
      </div>

      {emailErrorBanner && (
        <Alert variant="destructive">
          <AlertDescription>{emailErrorBanner}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Plan &amp; Billing</CardTitle>
            <CardDescription>{billing.plan_name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div>Status: <span className="font-medium">{billing.subscription_status}</span></div>
            <div>Interval: <span className="font-medium">{billing.billing_interval || "-"}</span></div>
            <div>Period start: <span className="text-muted-foreground">{formatDateTime(billing.current_period_start)}</span></div>
            <div>Trial ends: <span className="text-muted-foreground">{formatDateTime(billing.trial_ends_at)}</span></div>
            <div>Period end: <span className="text-muted-foreground">{formatDateTime(billing.current_period_end)}</span></div>
            <div className="pt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
                <Layers className="size-3.5 mr-1.5" />
                Change plan
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEndDateOpen(true)}>
                <Calendar className="size-3.5 mr-1.5" />
                Set end date
              </Button>
            </div>
            {summary.status_reason && (
              <div className="pt-2 text-xs text-muted-foreground">
                Status reason: {summary.status_reason} ({summary.status_changed_by || "admin"})
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Quota Usage</CardTitle>
            <CardDescription>Current billing window</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Scheduled posts</span>
                <span>
                  {quota.scheduled_used}
                  {quota.scheduled_limit !== null ? ` / ${quota.scheduled_limit}` : " (unlimited)"}
                </span>
              </div>
              {quota.scheduled_limit !== null && (
                <Progress value={quota.usage_percent} className="h-1.5" />
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Playground (period)</span>
              <span>
                {quota.playground_used}
                {quota.playground_limit !== null ? ` / ${quota.playground_limit}` : ""}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Docs tokens</span>
              <span>
                {quota.docs_tokens_used}
                {quota.docs_token_limit !== null ? ` / ${quota.docs_token_limit}` : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Connections</CardTitle>
            <CardDescription>LinkedIn &amp; Slack status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-medium">LinkedIn</span>
                <Badge variant={connections.linkedin.connected ? "outline" : "secondary"}>
                  {connections.linkedin.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {connections.linkedin.account_name || "No account"} · Expires{" "}
                {formatDateTime(connections.linkedin.expires_at)}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Slack</span>
                <Badge variant={connections.slack.connected ? "outline" : "secondary"}>
                  {connections.slack.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {connections.slack.team_name || "No workspace"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-base">Recent Pipeline Runs</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tokens (in / out)</TableHead>
                <TableHead>Cost (USD)</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                    No pipeline runs yet.
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{formatDateTime(r.started_at)}</TableCell>
                    <TableCell className="text-xs">{r.run_type} ({r.usage_kind})</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{r.tokens_in} / {r.tokens_out}</TableCell>
                    <TableCell className="text-xs font-mono">${r.cost_usd.toFixed(4)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {r.error_code ? `${r.error_code}: ${r.error_detail || ""}` : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-base">Email Notification Logs</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {email_logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                    No notification emails logged.
                  </TableCell>
                </TableRow>
              ) : (
                email_logs.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{formatDateTime(e.created_at)}</TableCell>
                    <TableCell className="text-xs font-medium">{e.type}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "sent" ? "outline" : "destructive"}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.attempts}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {e.error || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {e.status === "failed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resendMutation.isPending}
                          onClick={() => resendMutation.mutate(e.id)}
                        >
                          <RefreshCw className="size-3.5 mr-1.5" />
                          Resend
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      No payments submitted.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{formatDateTime(p.submitted_at)}</TableCell>
                      <TableCell className="text-xs">{p.plan_id} ({p.billing_interval})</TableCell>
                      <TableCell className="text-xs">${p.amount_usd.toFixed(2)} / Rs {p.amount_pkr}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="text-base">Admin Audit Logs</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
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
                {audit_logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      No audit events recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  audit_logs.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{formatDateTime(a.created_at)}</TableCell>
                      <TableCell className="text-xs">{a.actor_email}</TableCell>
                      <TableCell className="text-xs font-mono">{a.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {a.reason || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

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
              `Plan changed to ${res.plan_name}, but email failed: ${res.email_error || "SMTP error"}. You can resend it below.`
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
