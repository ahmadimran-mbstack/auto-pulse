"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Calendar, Layers, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DialogCallout, StandardDialog } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ApiClientError,
  changeAdminUserPlan,
  deleteAdminUser,
  getAdminPlansOverview,
  setAdminUserSubscriptionEnd,
  updateAdminUserStatus,
} from "@/lib/api";
import type { AccountStatus } from "@/types/admin";

function UserStatusModalInner({
  onOpenChange,
  userId,
  userEmail,
  currentStatus,
  onCompleted,
}: {
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentStatus: AccountStatus;
  onCompleted?: (res: {
    userId: string;
    account_status: string;
    email_status: string;
    email_error?: string | null;
  }) => void;
}) {
  const qc = useQueryClient();
  const [newStatus, setNewStatus] = React.useState<AccountStatus>(
    currentStatus === "active" ? "suspended" : "active"
  );
  const [reason, setReason] = React.useState("");
  const [sendEmail, setSendEmail] = React.useState(true);
  const [adminMessage, setAdminMessage] = React.useState("");
  const reasonInputRef = React.useRef<HTMLInputElement | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateAdminUserStatus(userId, {
        status: newStatus,
        expected_status: currentStatus,
        reason: reason.trim(),
        send_email: sendEmail,
        admin_message: adminMessage.trim() || undefined,
      }),
    onSuccess: (res) => {
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      onCompleted?.({ userId, ...res });
      if (res.email_status === "failed") {
        toast.warning("Status updated, but email delivery failed.");
      } else {
        toast.success(`User status updated to ${res.account_status}.`);
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError && err.status === 409) {
        toast.error("Status was changed by another admin. Refreshed.");
        onOpenChange(false);
        qc.invalidateQueries({ queryKey: ["admin-users"] });
        qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      } else {
        toast.error(
          err instanceof ApiClientError ? err.message : "Could not update user status."
        );
      }
    },
  });

  const isRestricting = newStatus === "suspended" || newStatus === "disabled";
  const reasonInvalid = reason.trim().length > 0 && reason.trim().length < 2;

  return (
    <StandardDialog
      open
      onOpenChange={onOpenChange}
      title="Change account status"
      description={
        <span>
          Update access state for <span className="font-medium text-foreground">{userEmail}</span>.
        </span>
      }
      icon={isRestricting ? ShieldAlert : Ban}
      tone={newStatus === "disabled" ? "danger" : isRestricting ? "warning" : "info"}
      maxWidth="sm:max-w-md"
      initialFocusRef={reasonInputRef}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant={newStatus === "disabled" ? "destructive" : "default"}
            disabled={
              mutation.isPending ||
              reason.trim().length < 2 ||
              newStatus === currentStatus
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Save status
          </Button>
        </>
      }
    >
      {isRestricting && (
        <DialogCallout tone={newStatus === "disabled" ? "danger" : "warning"}>
          {newStatus === "suspended"
            ? "Existing sessions will be rejected with ACCOUNT_SUSPENDED, scheduled publishing will stop, and pending approval links will stop working."
            : "Account access will be permanently disabled until reactivated by an admin, stopping all runs and publishing."}
        </DialogCallout>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="modal-status-select">New status</Label>
        <Select value={newStatus} onValueChange={(v) => setNewStatus(v as AccountStatus)}>
          <SelectTrigger id="modal-status-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modal-status-reason">Reason (required)</Label>
        <Input
          ref={reasonInputRef}
          id="modal-status-reason"
          placeholder="e.g., Chargeback / terms violation / user requested"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {reasonInvalid && (
          <p className="text-xs text-destructive">Reason must be at least 2 characters.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modal-status-msg">Message to user (optional)</Label>
        <Textarea
          id="modal-status-msg"
          rows={3}
          placeholder="Optional note included in the notification email..."
          value={adminMessage}
          onChange={(e) => setAdminMessage(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <Label htmlFor="modal-status-email" className="text-xs font-medium cursor-pointer">
          Send email notification to user
        </Label>
        <Switch id="modal-status-email" checked={sendEmail} onCheckedChange={setSendEmail} />
      </div>
    </StandardDialog>
  );
}

export function UserStatusModal({
  open,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentStatus: AccountStatus;
  onCompleted?: (res: {
    userId: string;
    account_status: string;
    email_status: string;
    email_error?: string | null;
  }) => void;
}) {
  if (!open) return null;
  return <UserStatusModalInner key={`${props.userId}-${props.currentStatus}`} {...props} />;
}

function UserDeleteModalInner({
  onOpenChange,
  userId,
  userEmail,
  onDeleted,
}: {
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [sendEmail, setSendEmail] = React.useState(true);
  const [adminMessage, setAdminMessage] = React.useState("");
  const confirmEmailRef = React.useRef<HTMLInputElement | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      deleteAdminUser(userId, {
        confirm_email: confirmEmail.trim(),
        reason: reason.trim(),
        send_email: sendEmail,
        admin_message: adminMessage.trim() || undefined,
      }),
    onSuccess: (res) => {
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-deleted-accounts"] });
      if (res.email_status === "failed") {
        toast.warning(
          `Account deleted, but notification email failed: ${res.email_error || "SMTP error"}`
        );
      } else {
        toast.success("User account permanently deleted.");
      }
      onDeleted?.();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete user.");
    },
  });

  const emailMismatch = confirmEmail.trim().length > 0 && confirmEmail.trim() !== userEmail;

  return (
    <StandardDialog
      open
      onOpenChange={onOpenChange}
      title="Delete user account"
      description={
        <span>
          Permanently remove <span className="font-medium text-foreground">{userEmail}</span>.
        </span>
      }
      icon={Trash2}
      tone="danger"
      maxWidth="sm:max-w-md"
      initialFocusRef={confirmEmailRef}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={
              mutation.isPending ||
              confirmEmail.trim() !== userEmail ||
              reason.trim().length < 2
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Delete permanently
          </Button>
        </>
      }
    >
      <DialogCallout tone="danger">
        This permanently removes the user&apos;s profile, posts, runs, LinkedIn/Slack connections,
        and uploaded customization files. This email will be blocked from signing up again until
        allowed by an admin. Payments, support tickets, email logs, and audit logs are preserved.
      </DialogCallout>

      <div className="space-y-1.5">
        <Label htmlFor="modal-confirm-email">
          Type <span className="font-mono font-semibold">{userEmail}</span> to confirm
        </Label>
        <Input
          ref={confirmEmailRef}
          id="modal-confirm-email"
          placeholder={userEmail}
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
        />
        {emailMismatch && (
          <p className="text-xs text-destructive">Email confirmation does not match.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modal-delete-reason">Reason (required)</Label>
        <Input
          id="modal-delete-reason"
          placeholder="e.g., Account removal requested by user"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modal-delete-msg">Message to user (optional)</Label>
        <Textarea
          id="modal-delete-msg"
          rows={3}
          placeholder="Optional note included in the deletion email..."
          value={adminMessage}
          onChange={(e) => setAdminMessage(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <Label htmlFor="modal-delete-email" className="text-xs font-medium cursor-pointer">
          Send account deleted email notification
        </Label>
        <Switch id="modal-delete-email" checked={sendEmail} onCheckedChange={setSendEmail} />
      </div>
    </StandardDialog>
  );
}

export function UserDeleteModal({
  open,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  onDeleted?: () => void;
}) {
  if (!open) return null;
  return <UserDeleteModalInner key={props.userId} {...props} />;
}

function ChangePlanModalInner({
  onOpenChange,
  userId,
  userEmail,
  currentPlanId,
  currentInterval,
  isAdminUser,
  onCompleted,
}: {
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentPlanId: string;
  currentInterval: string | null;
  isAdminUser?: boolean;
  onCompleted?: (res: {
    userId: string;
    plan_name: string;
    email_status: string;
    email_error?: string | null;
  }) => void;
}) {
  const qc = useQueryClient();
  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: getAdminPlansOverview,
    staleTime: 60_000,
  });
  const availablePlans = React.useMemo(
    () =>
      (plansQuery.data?.plans || []).filter((p) => {
        if (p.id === "internal" && !isAdminUser) return false;
        return p.is_active !== false || p.id === currentPlanId;
      }),
    [plansQuery.data, isAdminUser, currentPlanId]
  );
  const annualPct = Math.round((plansQuery.data?.annual_discount ?? 0.05) * 100);
  const [planId, setPlanId] = React.useState(currentPlanId);
  const [interval, setInterval] = React.useState<"monthly" | "annual">(
    currentInterval === "annual" ? "annual" : "monthly"
  );
  const [resetQuota, setResetQuota] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [sendEmail, setSendEmail] = React.useState(true);
  const [adminMessage, setAdminMessage] = React.useState("");
  const reasonInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedPlan = availablePlans.find((p) => p.id === planId);
  const isPaidPlan = selectedPlan
    ? !selectedPlan.is_system && (selectedPlan.monthly_price_usd ?? 0) > 0
    : planId !== "trial" && planId !== "internal";

  const mutation = useMutation({
    mutationFn: () =>
      changeAdminUserPlan(userId, {
        plan_id: planId,
        billing_interval: isPaidPlan ? interval : null,
        expected_plan_id: currentPlanId,
        reset_quota_cycle: resetQuota,
        reason: reason.trim(),
        send_email: sendEmail,
        admin_message: adminMessage.trim() || undefined,
      }),
    onSuccess: (res) => {
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
      qc.invalidateQueries({ queryKey: ["admin-usage"] });
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      onCompleted?.({ userId, ...res });
      if (res.email_status === "failed") {
        toast.warning(`Plan changed to ${res.plan_name}, but email failed.`);
      } else if (res.email_status === "sent") {
        toast.success(`Plan changed to ${res.plan_name} (email sent).`);
      } else {
        toast.success(`Plan changed to ${res.plan_name}.`);
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError && err.status === 409) {
        toast.error("Plan changed concurrently. Refreshed.");
        onOpenChange(false);
        qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
        qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      } else {
        toast.error(err instanceof ApiClientError ? err.message : "Could not change plan.");
      }
    },
  });

  return (
    <StandardDialog
      open
      onOpenChange={onOpenChange}
      title="Change plan"
      description={
        <span>
          Update plan for <span className="font-medium text-foreground">{userEmail}</span>. Period
          end date is preserved unless updated separately.
        </span>
      }
      icon={Layers}
      tone="info"
      maxWidth="sm:max-w-lg"
      initialFocusRef={reasonInputRef}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || reason.trim().length < 2}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Save plan
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-4 gap-y-5">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="modal-plan-select">Plan</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger id="modal-plan-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availablePlans.length > 0 ? (
                availablePlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={planId}>{planId}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {isPaidPlan && (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="modal-plan-interval">Interval</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as "monthly" | "annual")}>
              <SelectTrigger id="modal-plan-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual ({annualPct}% off)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3 gap-3">
        <div>
          <Label htmlFor="modal-reset-quota" className="text-xs font-medium cursor-pointer">
            Reset quota cycle
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Sets quota cycle start to now (0 posts used in the new window).
          </p>
        </div>
        <Switch id="modal-reset-quota" checked={resetQuota} onCheckedChange={setResetQuota} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modal-plan-reason">Reason (required)</Label>
        <Input
          ref={reasonInputRef}
          id="modal-plan-reason"
          placeholder="e.g. Manual upgrade requested by support"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modal-plan-msg">Message to user (optional)</Label>
        <Textarea
          id="modal-plan-msg"
          rows={2}
          placeholder="Optional note included in the plan change email..."
          value={adminMessage}
          onChange={(e) => setAdminMessage(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <Label htmlFor="modal-plan-email" className="text-xs font-medium cursor-pointer">
          Send plan changed email notification
        </Label>
        <Switch id="modal-plan-email" checked={sendEmail} onCheckedChange={setSendEmail} />
      </div>
    </StandardDialog>
  );
}

export function ChangePlanModal({
  open,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentPlanId: string;
  currentInterval: string | null;
  isAdminUser?: boolean;
  onCompleted?: (res: {
    userId: string;
    plan_name: string;
    email_status: string;
    email_error?: string | null;
  }) => void;
}) {
  if (!open) return null;
  return (
    <ChangePlanModalInner
      key={`${props.userId}-${props.currentPlanId}-${props.currentInterval || ""}`}
      {...props}
    />
  );
}

function SetEndDateModalInner({
  onOpenChange,
  userId,
  userEmail,
  currentEndIso,
}: {
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentEndIso: string | null;
}) {
  const qc = useQueryClient();
  const [dateValue, setDateValue] = React.useState(
    currentEndIso ? currentEndIso.slice(0, 10) : ""
  );
  const [reason, setReason] = React.useState("");
  const [force, setForce] = React.useState(false);
  const endDateRef = React.useRef<HTMLInputElement | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      setAdminUserSubscriptionEnd(userId, {
        current_period_end: dateValue,
        reason: reason.trim(),
        force,
      }),
    onSuccess: () => {
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-usage"] });
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      toast.success("Subscription end date updated.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update end date.");
    },
  });

  return (
    <StandardDialog
      open
      onOpenChange={onOpenChange}
      title="Set subscription end date"
      description={
        <span>
          Normalized to 23:59:59 UTC for{" "}
          <span className="font-medium text-foreground">{userEmail}</span>. No email is sent.
        </span>
      }
      icon={Calendar}
      tone="info"
      maxWidth="sm:max-w-lg"
      initialFocusRef={endDateRef}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !dateValue || reason.trim().length < 5}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Save end date
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="modal-end-date">End date (UTC)</Label>
        <Input
          ref={endDateRef}
          id="modal-end-date"
          type="date"
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modal-end-reason">Reason (min 5 characters)</Label>
        <Input
          id="modal-end-reason"
          placeholder="e.g. Extended 14 days for onboarding delay"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3 gap-3">
        <Label htmlFor="modal-end-force" className="text-xs font-medium cursor-pointer">
          Allow setting a date in the past (force)
        </Label>
        <Switch id="modal-end-force" checked={force} onCheckedChange={setForce} />
      </div>
    </StandardDialog>
  );
}

export function SetEndDateModal({
  open,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentEndIso: string | null;
}) {
  if (!open) return null;
  return (
    <SetEndDateModalInner
      key={`${props.userId}-${props.currentEndIso || ""}`}
      {...props}
    />
  );
}
