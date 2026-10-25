"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckIcon, AlertCircleIcon, Loader2Icon } from "lucide-react";
import {
  disconnectLinkedInConnection,
  getConnections,
  startLinkedInConnection,
} from "@/lib/api";
import {
  formatConnectionExpiryDate,
  getConnectionDisplayState,
} from "@/lib/connections-state";
import type {
  ConnectionDisplayState,
  SocialConnection,
} from "@/types/connections";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

interface LinkedInConnectionRowProps {
  onConnectionChange?: () => void;
  initialConnection?: SocialConnection | null;
}

export function LinkedInConnectionRow({
  onConnectionChange,
  initialConnection,
}: LinkedInConnectionRowProps) {
  const [connection, setConnection] = useState<SocialConnection | null>(
    initialConnection !== undefined ? initialConnection : null
  );
  const [loading, setLoading] = useState(initialConnection === undefined);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);
  const [isDisconnecting, startDisconnectTransition] = useTransition();

  // Development-only state override to easily test all 4 UI states
  const [devStateOverride, setDevStateOverride] = useState<
    ConnectionDisplayState | "live"
  >("live");

  const fetchConnection = async (showLoadingState = true) => {
    if (showLoadingState) setLoading(true);
    setError(null);
    try {
      const connections = await getConnections();
      const linkedin = connections.find((c) => c.provider === "linkedin") || null;
      setConnection(linkedin);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "We cannot reach the server right now. Try again in a moment.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const [prevInitial, setPrevInitial] = useState(initialConnection);
  if (initialConnection !== prevInitial) {
    setPrevInitial(initialConnection);
    if (initialConnection !== undefined) {
      setConnection(initialConnection);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialConnection !== undefined) {
      return;
    }

    let isMounted = true;
    async function load() {
      try {
        const connections = await getConnections();
        if (!isMounted) return;
        const linkedin = connections.find((c) => c.provider === "linkedin") || null;
        setConnection(linkedin);
      } catch (err: unknown) {
        if (!isMounted) return;
        const message =
          err instanceof Error
            ? err.message
            : "We cannot reach the server right now. Try again in a moment.";
        setError(message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [initialConnection]);

  const handleStartConnection = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const res = await startLinkedInConnection();
      if (res?.authorization_url) {
        window.location.assign(res.authorization_url);
      } else {
        throw new Error("Unable to start connection. Please try again.");
      }
    } catch (err: unknown) {
      setIsStarting(false);
      const message =
        err instanceof Error
          ? err.message
          : "Unable to start connection. Please try again.";
      setError(message);
    }
  };

  const handleConfirmDisconnect = () => {
    startDisconnectTransition(async () => {
      try {
        await disconnectLinkedInConnection();
        setIsDisconnectOpen(false);
        await fetchConnection();
        onConnectionChange?.();
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not disconnect. Please try again.";
        setError(message);
      }
    });
  };

  const realState = getConnectionDisplayState(connection);
  const activeState: ConnectionDisplayState =
    devStateOverride === "live" ? realState : devStateOverride;

  const previewAccountName =
    connection?.account_name || "Jane Smith (Product Leader)";
  const previewExpiryDate = connection?.expires_at
    ? formatConnectionExpiryDate(connection.expires_at)
    : "November 20, 2026";
  const previewDaysLeft = connection?.days_left ?? 4;

  return (
    <div className="space-y-2">
      {/* Loading Skeleton */}
      {loading ? (
        <div
          role="status"
          aria-label="Loading connection status"
          className="py-4 px-5 rounded-lg bg-card border border-border flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="w-36 h-3.5" />
              <Skeleton className="w-48 h-3" />
            </div>
          </div>
          <Skeleton className="w-28 h-8 rounded-md" />
        </div>
      ) : error ? (
        /* Error State */
        <div
          role="alert"
          className="py-4 px-5 rounded-lg bg-status-danger-bg border border-destructive/20 text-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-destructive">
              Connection issue
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchConnection(true)}
          >
            Try again
          </Button>
        </div>
      ) : activeState === "not_connected" ? (
        /* 1. Not Connected State */
        <div className="py-4 px-5 rounded-lg bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-md bg-muted border border-border flex items-center justify-center text-muted-foreground shrink-0">
              <span className="size-2 rounded-full bg-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                LinkedIn is not connected.
              </p>
              <p className="text-xs text-muted-foreground">
                Connect your account to allow AutoPulse to publish approved posts.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleStartConnection}
            disabled={isStarting}
            className="shrink-0"
          >
            {isStarting && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
            <span>{isStarting ? "Opening LinkedIn..." : "Connect LinkedIn"}</span>
          </Button>
        </div>
      ) : activeState === "connected" ? (
        /* 2. Connected State */
        <div className="py-4 px-5 rounded-lg bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="size-8 rounded-md bg-signal-soft border border-signal-line flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
              <CheckIcon className="size-4 text-primary" strokeWidth={2} />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Connected as {previewAccountName}
                </p>
                <Badge variant="approved">
                  Active
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Needs a new connection on {previewExpiryDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDisconnectOpen(true)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : activeState === "expiring_soon" ? (
        /* 3. Expiring Soon State */
        <div className="py-4 px-5 rounded-lg bg-card border border-status-draft-fg/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="size-8 rounded-md bg-signal-soft border border-signal-line flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
              <CheckIcon className="size-4 text-primary" strokeWidth={2} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Connected as {previewAccountName}
                </p>
              </div>
              <Badge variant="draft">
                Expires in {previewDaysLeft} {previewDaysLeft === 1 ? "day" : "days"}. Reconnect to keep posting.
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDisconnectOpen(true)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Disconnect
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleStartConnection}
              disabled={isStarting}
            >
              {isStarting && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
              <span>{isStarting ? "Opening LinkedIn..." : "Reconnect"}</span>
            </Button>
          </div>
        </div>
      ) : (
        /* 4. Expired State */
        <div className="py-4 px-5 rounded-lg bg-status-danger-bg border border-destructive/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="size-8 rounded-md bg-card border border-destructive/30 flex items-center justify-center text-destructive shrink-0 mt-0.5 sm:mt-0">
              <AlertCircleIcon className="size-4 text-destructive" strokeWidth={2} />
            </div>

            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-destructive">
                Your LinkedIn connection has expired. Posts are paused until you reconnect.
              </p>
              <p className="text-xs text-muted-foreground">
                Previous authorization has lapsed. Click reconnect to restore publishing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDisconnectOpen(true)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Disconnect
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleStartConnection}
              disabled={isStarting}
            >
              {isStarting && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
              <span>{isStarting ? "Opening LinkedIn..." : "Reconnect"}</span>
            </Button>
          </div>
        </div>
      )}

      {/* shadcn AlertDialog for Disconnect Confirmation */}
      <AlertDialog open={isDisconnectOpen} onOpenChange={setIsDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect LinkedIn?</AlertDialogTitle>
            <AlertDialogDescription>
              AutoPulse will stop posting for you until you connect again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting}>
              Keep connected
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisconnect}
              disabled={isDisconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Development Preview Switcher */}
      {process.env.NODE_ENV !== "production" && (
        <div className="pt-1 flex items-center gap-1.5 text-caption font-mono text-muted-foreground overflow-x-auto pb-1">
          <span className="shrink-0 font-medium text-foreground">Dev UI Test:</span>
          {(
            [
              ["live", `Live (${realState})`],
              ["not_connected", "1. Not connected"],
              ["connected", "2. Connected"],
              ["expiring_soon", "3. Expiring soon"],
              ["expired", "4. Expired"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevStateOverride(key)}
              className={`px-2 py-0.5 rounded-sm cursor-pointer transition-colors ${
                devStateOverride === key
                  ? "bg-foreground text-background font-semibold"
                  : "bg-muted hover:bg-accent text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
