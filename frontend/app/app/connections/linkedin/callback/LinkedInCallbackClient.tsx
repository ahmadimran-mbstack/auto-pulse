"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { callbackLinkedInConnection, startLinkedInConnection } from "@/lib/api";
import { parseCallbackParams } from "@/lib/connections-state";

type CallbackStatus =
  | "connecting"
  | "cancelled"
  | "missing_params"
  | "error";

export function LinkedInCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read params once directly during render
  const parsed = parseCallbackParams(searchParams);

  // Derive initial status without needing a synchronous effect
  const initialStatus: CallbackStatus = parsed.error
    ? "cancelled"
    : !parsed.code || !parsed.state
    ? "missing_params"
    : "connecting";

  const [status, setStatus] = useState<CallbackStatus>(initialStatus);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isRestarting, setIsRestarting] = useState(false);

  // StrictMode ref guard so code exchange executes exactly once
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    // 1. Immediately strip the code and state from browser address bar
    if (typeof window !== "undefined") {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    // 2. Guard against React StrictMode running effects twice in development
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    // Do not call API if user cancelled or params are missing
    if (parsed.error || !parsed.code || !parsed.state) {
      return;
    }

    // 3. Exchange code and state with backend
    const performCallback = async (code: string, state: string) => {
      try {
        await callbackLinkedInConnection({ code, state });
        // Navigate back to dashboard with confirmation flag
        router.push("/app?connected=linkedin");
      } catch (err: unknown) {
        setStatus("error");
        if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
          setErrorMessage(
            "Your session expired while connecting to LinkedIn. Please sign in again, then start the connection once more."
          );
        } else if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage("Could not complete the LinkedIn connection. Please try again.");
        }
      }
    };

    performCallback(parsed.code, parsed.state);
  }, [parsed.code, parsed.state, parsed.error, router]);

  // Restart connection from scratch if needed
  const handleTryAgain = async () => {
    setIsRestarting(true);
    try {
      const res = await startLinkedInConnection();
      if (res?.authorization_url) {
        window.location.assign(res.authorization_url);
      } else {
        throw new Error("Unable to start connection.");
      }
    } catch {
      setIsRestarting(false);
      setErrorMessage("Could not restart connection. Please return to dashboard and try again.");
      setStatus("error");
    }
  };

  return (
    <div className="w-full max-w-[480px] mx-auto p-8 rounded-[16px] bg-surface border border-line text-left shadow-xs space-y-6">
      {/* 1. Loading State */}
      {status === "connecting" && (
        <div className="space-y-4 py-6 text-center" role="status" aria-live="polite">
          <div className="w-10 h-10 mx-auto rounded-full border-2 border-line border-t-signal animate-spin" />
          <div className="space-y-1">
            <h1 className="text-xl font-geist font-normal text-ink">
              Connecting your LinkedIn account
            </h1>
            <p className="text-xs text-muted leading-relaxed">
              Verifying permissions and securely linking your profile to AutoPulse.
            </p>
          </div>
        </div>
      )}

      {/* 2. Cancelled State */}
      {status === "cancelled" && (
        <div className="space-y-5" role="alert">
          <div className="w-10 h-10 rounded-[10px] bg-paper border border-line flex items-center justify-center text-muted">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-geist font-normal text-ink">
              LinkedIn connection was cancelled
            </h1>
            <p className="text-xs text-muted leading-relaxed">
              No changes were made to your AutoPulse account. You can reconnect whenever you are ready.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={handleTryAgain}
              disabled={isRestarting}
              className="px-4 py-2.5 rounded-[8px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors text-center disabled:opacity-60 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-signal"
            >
              {isRestarting ? "Opening LinkedIn..." : "Try again"}
            </button>
            <Link
              href="/app"
              className="px-4 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-xs font-medium hover:bg-paper transition-colors text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-line"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      )}

      {/* 3. Missing Parameters State */}
      {status === "missing_params" && (
        <div className="space-y-5" role="alert">
          <div className="w-10 h-10 rounded-[10px] bg-paper border border-line flex items-center justify-center text-muted">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-geist font-normal text-ink">
              Connection link not found
            </h1>
            <p className="text-xs text-muted leading-relaxed">
              This page is for finishing a LinkedIn connection. Go back to the dashboard to start.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/app"
              className="inline-block px-4 py-2.5 rounded-[8px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors text-center cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-signal"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      )}

      {/* 4. Error State */}
      {status === "error" && (
        <div className="space-y-5" role="alert">
          <div className="w-10 h-10 rounded-[10px] bg-rejected-bg border border-rose-200 flex items-center justify-center text-rejected-text">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-geist font-normal text-ink">
              Connection unsuccessful
            </h1>
            <p className="text-xs text-muted leading-relaxed">
              {errorMessage || "An unexpected error occurred while connecting. Please try again."}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={handleTryAgain}
              disabled={isRestarting}
              className="px-4 py-2.5 rounded-[8px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors text-center disabled:opacity-60 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-signal"
            >
              {isRestarting ? "Opening LinkedIn..." : "Try again"}
            </button>
            <Link
              href="/app"
              className="px-4 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-xs font-medium hover:bg-paper transition-colors text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-line"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
