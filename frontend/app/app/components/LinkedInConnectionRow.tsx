"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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

  // Load the current LinkedIn connection from backend
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

  useEffect(() => {
    // If preloaded in parallel by parent, use the initial data
    if (initialConnection !== undefined) {
      setConnection(initialConnection);
      setLoading(false);
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

  // Initiate connection flow and navigate to authorization URL
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

  // Confirm disconnection and remove connection row
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

  // Determine which state to display (allowing dev overrides for visual testing)
  const realState = getConnectionDisplayState(connection);
  const activeState: ConnectionDisplayState =
    devStateOverride === "live" ? realState : devStateOverride;

  // Fake dummy connection details for dev preview if needed
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
          className="py-4 px-5 rounded-[12px] bg-surface border border-line flex items-center justify-between animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200" />
            <div className="space-y-1.5">
              <div className="w-36 h-3.5 bg-slate-200 rounded" />
              <div className="w-48 h-3 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="w-28 h-8 bg-slate-200 rounded-[8px]" />
        </div>
      ) : error ? (
        /* Error State with Try Again */
        <div
          role="alert"
          className="py-4 px-5 rounded-[12px] bg-rejected-bg border border-rose-200 text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-rejected-text">
              Connection issue
            </p>
            <p className="text-xs text-muted leading-relaxed">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchConnection(true)}
            className="px-3.5 py-1.5 rounded-[8px] bg-surface border border-line text-xs font-medium text-ink hover:bg-paper transition-colors shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-signal"
          >
            Try again
          </button>
        </div>
      ) : activeState === "not_connected" ? (
        /* 1. Not Connected State */
        <div className="py-4 px-5 rounded-[12px] bg-surface border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-3">
            {/* Neutral idle indicator dot */}
            <div className="w-8 h-8 rounded-[8px] bg-paper border border-line flex items-center justify-center text-muted shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-muted/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">
                LinkedIn is not connected.
              </p>
              <p className="text-xs text-muted">
                Connect your account to allow AutoPulse to publish approved posts.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartConnection}
            disabled={isStarting}
            className="px-4 py-2 rounded-[8px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-signal"
          >
            {isStarting ? "Opening LinkedIn..." : "Connect LinkedIn"}
          </button>
        </div>
      ) : activeState === "connected" ? (
        /* 2. Connected State (Normal active) */
        <div className="py-4 px-5 rounded-[12px] bg-surface border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-start sm:items-center gap-3">
            {/* Published check style badge */}
            <div className="w-8 h-8 rounded-[8px] bg-signal-soft border border-[#93D7CE] flex items-center justify-center text-signal shrink-0 mt-0.5 sm:mt-0">
              <svg
                className="w-4 h-4 text-signal"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M3 8.5L6.5 12L13 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">
                  Connected as {previewAccountName}
                </p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-signal bg-signal-soft border border-[#93D7CE]">
                  Active
                </span>
              </div>
              <p className="text-xs text-muted">
                Needs a new connection on {previewExpiryDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setIsDisconnectOpen(true)}
              className="text-xs text-muted hover:text-rejected-text transition-colors underline cursor-pointer p-1"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : activeState === "expiring_soon" ? (
        /* 3. Expiring Soon State (<= 7 days left) */
        <div className="py-4 px-5 rounded-[12px] bg-surface border border-amber-300/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-start sm:items-center gap-3">
            {/* Published check style badge */}
            <div className="w-8 h-8 rounded-[8px] bg-signal-soft border border-[#93D7CE] flex items-center justify-center text-signal shrink-0 mt-0.5 sm:mt-0">
              <svg
                className="w-4 h-4 text-signal"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M3 8.5L6.5 12L13 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">
                  Connected as {previewAccountName}
                </p>
              </div>
              {/* Draft badge colors highlighting remaining days */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-draft-text bg-draft-bg border border-amber-200">
                <span>
                  Expires in {previewDaysLeft} {previewDaysLeft === 1 ? "day" : "days"}. Reconnect to keep posting.
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setIsDisconnectOpen(true)}
              className="text-xs text-muted hover:text-rejected-text transition-colors underline cursor-pointer p-1"
            >
              Disconnect
            </button>
            <button
              type="button"
              onClick={handleStartConnection}
              disabled={isStarting}
              className="px-4 py-2 rounded-[8px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-signal"
            >
              {isStarting ? "Opening LinkedIn..." : "Reconnect"}
            </button>
          </div>
        </div>
      ) : (
        /* 4. Expired State */
        <div className="py-4 px-5 rounded-[12px] bg-rejected-bg border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-rose-100 border border-rose-200 flex items-center justify-center text-rejected-text shrink-0 mt-0.5 sm:mt-0">
              <svg
                className="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-rejected-text">
                Your LinkedIn connection has expired. Posts are paused until you reconnect.
              </p>
              <p className="text-xs text-muted">
                Previous authorization has lapsed. Click reconnect to restore publishing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setIsDisconnectOpen(true)}
              className="text-xs text-muted hover:text-rejected-text transition-colors underline cursor-pointer p-1"
            >
              Disconnect
            </button>
            <button
              type="button"
              onClick={handleStartConnection}
              disabled={isStarting}
              className="px-4 py-2 rounded-[8px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-signal"
            >
              {isStarting ? "Opening LinkedIn..." : "Reconnect"}
            </button>
          </div>
        </div>
      )}

      {/* Accessible Radix Confirm Disconnect Dialog */}
      <Dialog.Root open={isDisconnectOpen} onOpenChange={setIsDisconnectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 animate-fade-in" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[420px] rounded-[16px] bg-surface p-6 shadow-xl border border-line z-50 focus:outline-none text-left"
            aria-describedby="disconnect-desc"
          >
            <Dialog.Title className="text-lg font-semibold text-ink mb-2">
              Disconnect LinkedIn?
            </Dialog.Title>
            <Dialog.Description
              id="disconnect-desc"
              className="text-sm text-muted leading-relaxed mb-6"
            >
              AutoPulse will stop posting for you until you connect again.
            </Dialog.Description>

            <div className="flex flex-col sm:flex-row-reverse gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={isDisconnecting}
                className="px-4 py-2 rounded-[8px] bg-rose-600 text-surface text-xs font-medium hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isDisconnecting}
                  className="px-4 py-2 rounded-[8px] border border-line bg-surface text-ink text-xs font-medium hover:bg-paper transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-line"
                >
                  Keep connected
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Development Preview Switcher (Allows testing all 4 UI states directly) */}
      {process.env.NODE_ENV !== "production" && (
        <div className="pt-1 flex items-center gap-1.5 text-[11px] font-mono text-muted overflow-x-auto pb-1">
          <span className="shrink-0 font-medium text-ink">Dev UI Test:</span>
          <button
            type="button"
            onClick={() => setDevStateOverride("live")}
            className={`px-2 py-0.5 rounded cursor-pointer ${
              devStateOverride === "live"
                ? "bg-ink text-surface font-semibold"
                : "bg-paper hover:bg-slate-200"
            }`}
          >
            Live ({realState})
          </button>
          <button
            type="button"
            onClick={() => setDevStateOverride("not_connected")}
            className={`px-2 py-0.5 rounded cursor-pointer ${
              devStateOverride === "not_connected"
                ? "bg-ink text-surface font-semibold"
                : "bg-paper hover:bg-slate-200"
            }`}
          >
            1. Not connected
          </button>
          <button
            type="button"
            onClick={() => setDevStateOverride("connected")}
            className={`px-2 py-0.5 rounded cursor-pointer ${
              devStateOverride === "connected"
                ? "bg-ink text-surface font-semibold"
                : "bg-paper hover:bg-slate-200"
            }`}
          >
            2. Connected
          </button>
          <button
            type="button"
            onClick={() => setDevStateOverride("expiring_soon")}
            className={`px-2 py-0.5 rounded cursor-pointer ${
              devStateOverride === "expiring_soon"
                ? "bg-ink text-surface font-semibold"
                : "bg-paper hover:bg-slate-200"
            }`}
          >
            3. Expiring soon
          </button>
          <button
            type="button"
            onClick={() => setDevStateOverride("expired")}
            className={`px-2 py-0.5 rounded cursor-pointer ${
              devStateOverride === "expired"
                ? "bg-ink text-surface font-semibold"
                : "bg-paper hover:bg-slate-200"
            }`}
          >
            4. Expired
          </button>
        </div>
      )}
    </div>
  );
}
