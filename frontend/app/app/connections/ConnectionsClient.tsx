"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CheckIcon,
  AlertCircleIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Section } from "@/components/app/Section";
import { ErrorState } from "@/components/app/ErrorState";
import { ConnectionsSkeleton } from "@/components/app/ConnectionsSkeleton";
import { PlatformLabel } from "@/components/app/PlatformLabel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useConnectionsQuery,
  useDisconnectLinkedInMutation,
  useSlackStatusQuery,
  useDisconnectSlackMutation,
  useProfileQuery,
  usePatchProfileMutation,
} from "@/lib/queries";
import {
  startLinkedInConnection,
  connectSlack,
  testSlack,
} from "@/lib/api";
import {
  formatConnectionExpiryDate,
  getConnectionDisplayState,
  getConnectionUiInfo,
} from "@/lib/connections-state";

interface ConnectionsClientProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
}

export function ConnectionsClient({ user }: ConnectionsClientProps) {
  const searchParams = useSearchParams();
  const slackParam = searchParams.get("slack");

  // Query state
  const {
    data: connections,
    isLoading: isConnectionsLoading,
    isError: isConnectionsError,
    error: connectionsError,
    refetch: refetchConnections,
  } = useConnectionsQuery(user.id);

  const {
    data: slackStatus,
    isLoading: isSlackLoading,
    isError: isSlackError,
    error: slackError,
    refetch: refetchSlack,
  } = useSlackStatusQuery(user.id);

  const {
    data: profile,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useProfileQuery(user.id);

  const disconnectLinkedInMutation = useDisconnectLinkedInMutation(user.id);
  const disconnectSlackMutation = useDisconnectSlackMutation(user.id);
  const patchProfileMutation = usePatchProfileMutation(user.id);

  // Local action state
  const [isStartingLinkedInOAuth, setIsStartingLinkedInOAuth] = React.useState(false);
  const [isStartingSlackOAuth, setIsStartingSlackOAuth] = React.useState(false);
  const [isSendingSlackTest, setIsSendingSlackTest] = React.useState(false);
  const [showLinkedInDisconnectDialog, setShowLinkedInDisconnectDialog] = React.useState(false);
  const [showSlackDisconnectDialog, setShowSlackDisconnectDialog] = React.useState(false);

  // Handle ?slack=connected | ?slack=denied | ?slack=error returned from Slack OAuth
  React.useEffect(() => {
    if (!slackParam) return;

    if (slackParam === "connected") {
      toast.success("Slack workspace connected successfully!");
    } else if (slackParam === "denied") {
      toast.error("Slack connection was cancelled or denied.");
    } else if (slackParam === "error") {
      toast.error("Failed to connect to Slack. Please try again.");
    }

    // Clean up query param from URL without page reload
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("slack");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
  }, [slackParam]);

  // Loading skeleton
  if (isConnectionsLoading || isSlackLoading || isProfileLoading) {
    return <ConnectionsSkeleton />;
  }

  // Error handling
  if (isConnectionsError || isSlackError) {
    return (
      <div className="py-12">
        <ErrorState
          message={
            (connectionsError instanceof Error && connectionsError.message) ||
            (slackError instanceof Error && slackError.message) ||
            "Unable to load connection details."
          }
          onRetry={() => {
            refetchConnections();
            refetchSlack();
            refetchProfile();
          }}
        />
      </div>
    );
  }

  const linkedin = connections?.find((c) => c.provider === "linkedin") || null;
  const linkedinDisplayState = getConnectionDisplayState(linkedin);
  const linkedinUiInfo = getConnectionUiInfo(linkedinDisplayState);

  // Start LinkedIn OAuth flow
  const handleStartLinkedInOAuth = async () => {
    setIsStartingLinkedInOAuth(true);
    try {
      const response = await startLinkedInConnection();
      if (response?.authorization_url) {
        window.location.href = response.authorization_url;
      } else {
        throw new Error("Missing authorization redirect URL.");
      }
    } catch (err) {
      setIsStartingLinkedInOAuth(false);
      toast.error(
        err instanceof Error ? err.message : "Could not initiate LinkedIn connection."
      );
    }
  };

  // Start Slack OAuth flow
  const handleStartSlackOAuth = async () => {
    setIsStartingSlackOAuth(true);
    try {
      const response = await connectSlack({ return_to: "dashboard" });
      if (response?.authorize_url) {
        window.location.assign(response.authorize_url);
      } else {
        throw new Error("Missing Slack authorization URL.");
      }
    } catch (err) {
      setIsStartingSlackOAuth(false);
      toast.error(
        err instanceof Error ? err.message : "Could not initiate Slack connection."
      );
    }
  };

  // Send Slack test DM message
  const handleSendSlackTest = async () => {
    setIsSendingSlackTest(true);
    try {
      const res = await testSlack();
      if (res.sent) {
        toast.success("Test message delivered to your Slack direct messages!");
      } else {
        throw new Error("Slack test message was not acknowledged.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to deliver Slack test message."
      );
    } finally {
      setIsSendingSlackTest(false);
    }
  };

  // Disconnect LinkedIn
  const handleConfirmLinkedInDisconnect = async () => {
    try {
      await disconnectLinkedInMutation.mutateAsync();
      setShowLinkedInDisconnectDialog(false);
      toast.success("LinkedIn profile disconnected.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to disconnect LinkedIn account."
      );
    }
  };

  // Disconnect Slack
  const handleConfirmSlackDisconnect = async () => {
    try {
      await disconnectSlackMutation.mutateAsync();
      setShowSlackDisconnectDialog(false);
      toast.success("Slack workspace disconnected.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to disconnect Slack workspace."
      );
    }
  };

  // Toggle Slack approval switch in Profile
  const handleToggleSlackApproval = async (enabled: boolean) => {
    try {
      await patchProfileMutation.mutateAsync({
        approval: { slack_enabled: enabled },
      });
      toast.success(
        enabled ? "Slack approval enabled." : "Slack approval disabled."
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update approval settings."
      );
    }
  };

  const isSlackConnected = slackStatus?.status === "connected";
  const isSlackDisconnected = slackStatus?.status === "disconnected";
  const isSlackApprovalEnabled =
    profile?.approval?.slack?.enabled ?? profile?.slack_approval_enabled ?? false;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      <PageHeader
        title="Connections"
        description="Manage your connected social platforms, review channels, and automated publishing profiles."
      />

      {/* Disconnected Slack Warning Banner */}
      {isSlackDisconnected && (
        <div
          role="alert"
          className="p-4 rounded-lg border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
              <AlertCircleIcon className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Slack disconnected. Approvals are going to your email.
              </p>
              {slackStatus?.last_error && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Reason: {slackStatus.last_error}
                </p>
              )}
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleStartSlackOAuth}
            disabled={isStartingSlackOAuth}
            className="shrink-0"
          >
            {isStartingSlackOAuth ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                Connecting...
              </>
            ) : (
              "Reconnect"
            )}
          </Button>
        </div>
      )}

      {/* Section: Connected Platforms (One shadcn Card per platform) */}
      <Section
        title="Platforms"
        description="Authorized publishing channels and interactive approval destinations."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Slack */}
          <Card className="flex flex-col justify-between p-6 bg-card border-card-border">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <PlatformLabel platform="slack" size="md" />
                {isSlackConnected && (
                  <Badge variant="outline" className="border-status-success-fg/30 bg-status-success-bg text-status-success-fg gap-1 text-xs">
                    <CheckIcon className="size-3" />
                    <span>Connected</span>
                  </Badge>
                )}
                {isSlackDisconnected && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertCircleIcon className="size-3" />
                    <span>Disconnected</span>
                  </Badge>
                )}
                {!isSlackConnected && !isSlackDisconnected && (
                  <Badge variant="outline" className="text-muted-foreground text-xs">
                    Not connected
                  </Badge>
                )}
              </div>

              {/* State 1: Not connected */}
              {!isSlackConnected && !isSlackDisconnected && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Approve posts from a Slack message.
                </p>
              )}

              {/* State 2: Connected */}
              {isSlackConnected && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground truncate">
                    Workspace:{" "}
                    <span className="font-semibold text-foreground">
                      {slackStatus?.team_name || "Connected"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Approval messages arrive as a direct message from AutoPulse.
                  </p>
                </div>
              )}

              {/* State 3: Disconnected */}
              {isSlackDisconnected && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {slackStatus?.last_error
                      ? `Reason: ${slackStatus.last_error}`
                      : "Slack token was revoked or expired. Reconnect to resume receiving approval messages."}
                  </p>
                </div>
              )}
            </div>

            {/* Slack Actions */}
            <div className="pt-6 mt-4 border-t border-border flex flex-wrap items-center gap-2">
              {!isSlackConnected && !isSlackDisconnected && (
                <Button
                  size="sm"
                  onClick={handleStartSlackOAuth}
                  disabled={isStartingSlackOAuth}
                >
                  {isStartingSlackOAuth ? (
                    <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                  ) : null}
                  <span>Connect Slack</span>
                </Button>
              )}

              {isSlackConnected && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSendSlackTest}
                    disabled={isSendingSlackTest}
                    className="gap-1.5"
                  >
                    {isSendingSlackTest ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <SendIcon className="size-3.5" />
                    )}
                    <span>Send test message</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSlackDisconnectDialog(true)}
                    disabled={disconnectSlackMutation.isPending}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    Disconnect
                  </Button>
                </>
              )}

              {isSlackDisconnected && (
                <Button
                  size="sm"
                  onClick={handleStartSlackOAuth}
                  disabled={isStartingSlackOAuth}
                >
                  {isStartingSlackOAuth ? (
                    <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                  ) : null}
                  <span>Reconnect</span>
                </Button>
              )}
            </div>
          </Card>

          {/* Card 2: LinkedIn (Same card style, keeping existing behavior) */}
          <Card className="flex flex-col justify-between p-6 bg-card border-card-border">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <PlatformLabel platform="linkedin" size="md" />
                <Badge variant={linkedinUiInfo.badgeVariant}>
                  {linkedinDisplayState === "connected" && (
                    <CheckIcon className="size-3 mr-1" />
                  )}
                  {linkedinDisplayState === "expiring_soon" && (
                    <AlertCircleIcon className="size-3 mr-1" />
                  )}
                  {linkedinDisplayState === "expired" && (
                    <AlertCircleIcon className="size-3 mr-1" />
                  )}
                  <span>{linkedinUiInfo.badgeLabel}</span>
                </Badge>
              </div>

              <div className="space-y-1.5">
                {linkedin?.account_name ? (
                  <p className="text-sm font-medium text-foreground truncate">
                    Connected as{" "}
                    <span className="font-semibold">{linkedin.account_name}</span>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-foreground">
                    LinkedIn Member Account
                  </p>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {linkedinUiInfo.description}
                </p>
              </div>

              {linkedin?.expires_at && linkedinDisplayState !== "not_connected" && (
                <p className="text-xs text-muted-foreground tabular-nums pt-1">
                  {linkedinDisplayState === "expired"
                    ? `Expired on ${formatConnectionExpiryDate(linkedin.expires_at)}`
                    : `Needs reconnecting on ${formatConnectionExpiryDate(linkedin.expires_at)} (${linkedin.days_left} days remaining)`}
                </p>
              )}
            </div>

            {/* LinkedIn Actions */}
            <div className="pt-6 mt-4 border-t border-border flex flex-wrap items-center gap-2">
              {linkedinDisplayState === "not_connected" && (
                <Button
                  size="sm"
                  onClick={handleStartLinkedInOAuth}
                  disabled={isStartingLinkedInOAuth}
                >
                  {isStartingLinkedInOAuth ? (
                    <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                  ) : null}
                  <span>Connect LinkedIn</span>
                </Button>
              )}

              {(linkedinDisplayState === "connected" ||
                linkedinDisplayState === "expiring_soon") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartLinkedInOAuth}
                    disabled={isStartingLinkedInOAuth}
                  >
                    {isStartingLinkedInOAuth ? (
                      <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                    ) : null}
                    <span>Reconnect</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLinkedInDisconnectDialog(true)}
                    disabled={disconnectLinkedInMutation.isPending}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    Disconnect
                  </Button>
                </>
              )}

              {linkedinDisplayState === "expired" && (
                <Button
                  size="sm"
                  onClick={handleStartLinkedInOAuth}
                  disabled={isStartingLinkedInOAuth}
                >
                  {isStartingLinkedInOAuth ? (
                    <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                  ) : null}
                  <span>Reconnect LinkedIn</span>
                </Button>
              )}
            </div>
          </Card>

          {/* Card 3: Instagram (Disabled, Coming soon badge, no connect button) */}
          <Card className="flex flex-col justify-between p-6 bg-card border-card-border opacity-75">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <PlatformLabel platform="instagram" size="md" />
                <Badge variant="secondary">Coming soon</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Visual feed and story publishing automation for verified business profiles.
              </p>
            </div>
            <div className="pt-6 mt-4 border-t border-border text-xs text-muted-foreground italic">
              Channel in active development
            </div>
          </Card>

          {/* Card 4: Facebook (Disabled, Coming soon badge, no connect button) */}
          <Card className="flex flex-col justify-between p-6 bg-card border-card-border opacity-75">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <PlatformLabel platform="facebook" size="md" />
                <Badge variant="secondary">Coming soon</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Company page publishing integration for verified Meta brand pages.
              </p>
            </div>
            <div className="pt-6 mt-4 border-t border-border text-xs text-muted-foreground italic">
              Channel in active development
            </div>
          </Card>
        </div>
      </Section>

      {/* Section: Approval Settings Card */}
      <Section
        title="Approval settings"
        description="Configure your review preferences and notification channels."
      >
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-foreground">
              Where do you approve posts?
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Choose the channels where AutoPulse sends daily draft previews before publishing.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border pt-0">
            {/* 1. Email Channel (Always on, switch locked on, small backup text) */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PlatformLabel platform="email" size="sm" />
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Required
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Email is always kept as a backup approval channel.
                </p>
              </div>
              <Switch
                checked={true}
                disabled={true}
                aria-label="Email approvals (locked on)"
                aria-readonly="true"
              />
            </div>

            {/* 2. Slack Channel (Switch, disabled with hint until connected) */}
            <div className="py-4 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PlatformLabel platform="slack" size="sm" />
                  {!isSlackConnected && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Not connected
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isSlackConnected
                    ? "Approval messages arrive as an interactive direct message from AutoPulse."
                    : "Connect Slack first to enable Slack approvals."}
                </p>
              </div>
              <Switch
                checked={isSlackConnected && isSlackApprovalEnabled}
                disabled={!isSlackConnected || patchProfileMutation.isPending}
                onCheckedChange={handleToggleSlackApproval}
                aria-label="Slack approvals"
              />
            </div>

            {/* 3. WhatsApp Channel (Coming soon Badge, disabled) */}
            <div className="py-4 flex items-center justify-between gap-4 opacity-75">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PlatformLabel platform="whatsapp" size="sm" />
                  <Badge variant="secondary">Coming soon</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Instant messaging approval via WhatsApp Business.
                </p>
              </div>
              <Switch
                checked={false}
                disabled={true}
                aria-label="WhatsApp approvals (coming soon)"
              />
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* Disconnect LinkedIn Alert Dialog */}
      <AlertDialog
        open={showLinkedInDisconnectDialog}
        onOpenChange={setShowLinkedInDisconnectDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect LinkedIn Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect LinkedIn? AutoPulse will not be able to publish your scheduled posts until you reconnect your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectLinkedInMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLinkedInDisconnect}
              disabled={disconnectLinkedInMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectLinkedInMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect Slack Alert Dialog */}
      <AlertDialog
        open={showSlackDisconnectDialog}
        onOpenChange={setShowSlackDisconnectDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Slack Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect your Slack workspace? You will stop receiving direct message approval cards, and approvals will fall back to email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectSlackMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSlackDisconnect}
              disabled={disconnectSlackMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectSlackMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
