"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ApiClientError,
  changeAdminUserPlan,
  deleteAdminUser,
  setAdminUserSubscriptionEnd,
  updateAdminUserStatus,
} from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import type { AccountStatus } from "@/types/admin";

export function AccountStatusPill({ status }: { status: AccountStatus }) {
  if (status === "active") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        active
      </Badge>
    );
  }
  if (status === "suspended") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      >
        suspended
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-destructive/40 bg-destructive/10 text-destructive"
    >
      disabled
    </Badge>
  );
}

export function UserStatusModal({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentStatus,
  onCompleted,
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
  const qc = useQueryClient();
  const [newStatus, setNewStatus] = React.useState<AccountStatus>(
    currentStatus === "active" ? "suspended" : "active"
  );
  const [reason, setReason] = React.useState("");
  const [sendEmail, setSendEmail] = React.useState(true);
  const [adminMessage, setAdminMessage] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setNewStatus(currentStatus === "active" ? "suspended" : "active");
      setReason("");
      setSendEmail(true);
      setAdminMessage("");
    }
  }, [open, currentStatus]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change account status</DialogTitle>
          <DialogDescription>
            Update status for {userEmail}. Suspending or disabling stops posting and cancels pending approvals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>New status</Label>
            <Select
              value={newStatus}
              onValueChange={(v) => setNewStatus(v as AccountStatus)}
            >
              <SelectTrigger>
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
              id="modal-status-reason"
              placeholder="e.g., Chargeback / terms violation / user requested"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="modal-status-email"
              checked={sendEmail}
              onCheckedChange={(v) => setSendEmail(Boolean(v))}
            />
            <Label
              htmlFor="modal-status-email"
              className="text-sm font-normal cursor-pointer"
            >
              Send email notification to user
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              reason.trim().length < 2 ||
              newStatus === currentStatus
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            Save status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserDeleteModal({
  open,
  onOpenChange,
  userId,
  userEmail,
  onDeleted,
}: {
  open: boolean;
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

  React.useEffect(() => {
    if (open) {
      setConfirmEmail("");
      setReason("");
      setSendEmail(true);
      setAdminMessage("");
    }
  }, [open]);

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
      toast.error(
        err instanceof ApiClientError ? err.message : "Could not delete user."
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user account</DialogTitle>
          <DialogDescription>
            This permanently removes {userEmail}, their posts, runs, connections, and uploads. Payments and audit logs are preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="modal-confirm-email">
              Type <span className="font-mono font-semibold">{userEmail}</span> to confirm
            </Label>
            <Input
              id="modal-confirm-email"
              placeholder={userEmail}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="modal-delete-email"
              checked={sendEmail}
              onCheckedChange={(v) => setSendEmail(Boolean(v))}
            />
            <Label
              htmlFor="modal-delete-email"
              className="text-sm font-normal cursor-pointer"
            >
              Send account deleted email notification
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
            {mutation.isPending && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChangePlanModal({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentPlanId,
  currentInterval,
  isAdminUser,
  onCompleted,
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
  const qc = useQueryClient();
  const [planId, setPlanId] = React.useState(currentPlanId);
  const [interval, setInterval] = React.useState<"monthly" | "annual">(
    currentInterval === "annual" ? "annual" : "monthly"
  );
  const [resetQuota, setResetQuota] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [sendEmail, setSendEmail] = React.useState(true);
  const [adminMessage, setAdminMessage] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setPlanId(currentPlanId);
      setInterval(currentInterval === "annual" ? "annual" : "monthly");
      setResetQuota(false);
      setReason("");
      setSendEmail(true);
      setAdminMessage("");
    }
  }, [open, currentPlanId, currentInterval]);

  const mutation = useMutation({
    mutationFn: () =>
      changeAdminUserPlan(userId, {
        plan_id: planId,
        billing_interval: planId === "trial" || planId === "internal" ? null : interval,
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

  const isPaidPlan = planId === "starter" || planId === "pro" || planId === "business";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Update plan for {userEmail}. End date is preserved; use Set end date to extend or shorten it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Free trial</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  {isAdminUser && <SelectItem value="internal">Internal</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {isPaidPlan && (
              <div className="space-y-1.5">
                <Label>Interval</Label>
                <Select value={interval} onValueChange={(v) => setInterval(v as "monthly" | "annual")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual (5% off)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label htmlFor="modal-reset-quota" className="text-sm font-medium">
                Reset quota cycle
              </Label>
              <p className="text-xs text-muted-foreground">
                Sets quota cycle start to now (0 posts used in the new window).
              </p>
            </div>
            <Switch
              id="modal-reset-quota"
              checked={resetQuota}
              onCheckedChange={setResetQuota}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modal-plan-reason">Reason (required)</Label>
            <Input
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

          <div className="flex items-center justify-between">
            <Label htmlFor="modal-plan-email" className="text-sm font-normal cursor-pointer">
              Send plan changed email notification
            </Label>
            <Switch
              id="modal-plan-email"
              checked={sendEmail}
              onCheckedChange={setSendEmail}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={mutation.isPending || reason.trim().length < 2}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SetEndDateModal({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentEndIso,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentEndIso: string | null;
}) {
  const qc = useQueryClient();
  const [dateValue, setDateValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [force, setForce] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDateValue(currentEndIso ? currentEndIso.slice(0, 10) : "");
      setReason("");
      setForce(false);
    }
  }, [open, currentEndIso]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set subscription end date</DialogTitle>
          <DialogDescription>
            Normalized to 23:59:59 UTC for {userEmail}. No email is sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="modal-end-date">End date (UTC)</Label>
            <Input
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

          <div className="flex items-center justify-between">
            <Label htmlFor="modal-end-force" className="text-sm font-normal cursor-pointer">
              Allow setting a date in the past (force)
            </Label>
            <Switch
              id="modal-end-force"
              checked={force}
              onCheckedChange={setForce}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={mutation.isPending || !dateValue || reason.trim().length < 5}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Save end date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
