"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Share2Icon,
  CheckIcon,
  AlertCircleIcon,
  Loader2Icon,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Section } from "@/components/app/Section";
import { ErrorState } from "@/components/app/ErrorState";
import { ConnectionsSkeleton } from "@/components/app/ConnectionsSkeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/lib/queries";
import { startLinkedInConnection } from "@/lib/api";
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
  const { data: connections, isLoading, isError, error, refetch } = useConnectionsQuery(user.id);
  const disconnectMutation = useDisconnectLinkedInMutation(user.id);

  const [isStartingOAuth, setIsStartingOAuth] = React.useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = React.useState(false);

  if (isLoading) {
    return <ConnectionsSkeleton />;
  }

  if (isError || !connections) {
    return (
      <div className="py-12">
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : "Unable to load connection details."
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const linkedin = connections.find((c) => c.provider === "linkedin") || null;
  const displayState = getConnectionDisplayState(linkedin);
  const uiInfo = getConnectionUiInfo(displayState);

  // Starts LinkedIn OAuth authorization flow
  const handleStartOAuth = async () => {
    setIsStartingOAuth(true);
    try {
      const response = await startLinkedInConnection();
      if (response?.authorization_url) {
        window.location.href = response.authorization_url;
      } else {
        throw new Error("Missing authorization redirect URL.");
      }
    } catch (err) {
      setIsStartingOAuth(false);
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not initiate LinkedIn connection. Try again."
      );
    }
  };

  // Confirms disconnecting LinkedIn
  const handleConfirmDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      setShowDisconnectDialog(false);
      toast.success("LinkedIn profile disconnected.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to disconnect LinkedIn account."
      );
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto">
      <PageHeader
        title="Connections"
        description="Manage your authorized social platforms and automated publishing profiles."
      />

      {/* Section: LinkedIn */}
      <Section
        title="LinkedIn"
        description="Your primary distribution channel for daily pulse content."
      >
        <Card className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground border border-border shrink-0">
                <Share2Icon className="size-5 text-primary" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-semibold text-foreground">
                    LinkedIn Member Account
                  </h3>
                  <Badge variant={uiInfo.badgeVariant}>
                    {displayState === "connected" && (
                      <CheckIcon className="size-3 mr-1" />
                    )}
                    {displayState === "expiring_soon" && (
                      <AlertCircleIcon className="size-3 mr-1 text-status-draft-fg" />
                    )}
                    {displayState === "expired" && (
                      <AlertCircleIcon className="size-3 mr-1" />
                    )}
                    <span>{uiInfo.badgeLabel}</span>
                  </Badge>
                </div>
                {linkedin?.account_name && (
                  <p className="text-sm font-medium text-foreground">
                    Connected as{" "}
                    <span className="font-semibold">{linkedin.account_name}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
                  {uiInfo.description}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {displayState === "not_connected" && (
                <Button
                  size="sm"
                  onClick={handleStartOAuth}
                  disabled={isStartingOAuth}
                >
                  {isStartingOAuth ? (
                    <Loader2Icon className="size-4 animate-spin mr-1.5" />
                  ) : null}
                  <span>Connect LinkedIn</span>
                </Button>
              )}

              {(displayState === "connected" || displayState === "expiring_soon") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartOAuth}
                    disabled={isStartingOAuth}
                  >
                    {isStartingOAuth ? (
                      <Loader2Icon className="size-4 animate-spin mr-1.5" />
                    ) : null}
                    <span>Reconnect</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setShowDisconnectDialog(true)}
                    disabled={disconnectMutation.isPending}
                  >
                    Disconnect
                  </Button>
                </>
              )}

              {displayState === "expired" && (
                <Button
                  size="sm"
                  onClick={handleStartOAuth}
                  disabled={isStartingOAuth}
                >
                  {isStartingOAuth ? (
                    <Loader2Icon className="size-4 animate-spin mr-1.5" />
                  ) : null}
                  <span>Reconnect LinkedIn</span>
                </Button>
              )}
            </div>
          </div>

          {/* Connection Expiry & Telemetry Details */}
          {linkedin?.expires_at && displayState !== "not_connected" && (
            <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {displayState === "expired"
                  ? `Expired on ${formatConnectionExpiryDate(linkedin.expires_at)}`
                  : `Needs reconnecting on ${formatConnectionExpiryDate(linkedin.expires_at)} (${linkedin.days_left} days remaining)`}
              </span>
              <span className="text-caption">
                OAuth token valid for personal LinkedIn profiles
              </span>
            </div>
          )}
        </Card>
      </Section>

      {/* Muted Section: Other Networks (No action buttons) */}
      <Section
        title="Other networks"
        description="Additional distribution channels currently under active roadmap development."
      >
        <Card className="divide-y divide-border bg-card">
          <div className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium text-foreground">Instagram</span>
              <p className="text-xs text-muted-foreground">
                Visual story and feed automation for business profiles.
              </p>
            </div>
            <Badge variant="neutral">Not available yet</Badge>
          </div>

          <div className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium text-foreground">Facebook</span>
              <p className="text-xs text-muted-foreground">
                Page publishing integration for verified company pages.
              </p>
            </div>
            <Badge variant="neutral">Not available yet</Badge>
          </div>
        </Card>
      </Section>

      {/* Disconnect Confirmation Alert Dialog */}
      <AlertDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect LinkedIn Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect LinkedIn? AutoPulse will not be able to publish your scheduled posts until you reconnect your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisconnect}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
