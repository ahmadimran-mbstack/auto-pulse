"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { callbackLinkedInConnection, startLinkedInConnection } from "@/lib/api";
import { parseCallbackParams } from "@/lib/connections-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, XCircle } from "lucide-react";

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
        // Return to caller page if specified (such as /app/playground), otherwise default to /app
        const returnUrl = typeof window !== "undefined" ? sessionStorage.getItem("linkedin_oauth_return_url") : null;
        if (returnUrl) {
          sessionStorage.removeItem("linkedin_oauth_return_url");
          const target = returnUrl.includes("?") ? `${returnUrl}&connected=linkedin` : `${returnUrl}?connected=linkedin`;
          router.push(target);
        } else {
          router.push("/app?connected=linkedin");
        }

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
    <Card className="w-full max-w-md mx-auto p-8 text-left space-y-6">
      {/* 1. Loading State */}
      {status === "connecting" && (
        <div className="space-y-4 py-6 text-center" role="status" aria-live="polite">
          <Loader2 className="size-10 mx-auto animate-spin text-primary" strokeWidth={1.5} />
          <div className="space-y-1">
            <h1 className="text-h3 font-display text-foreground">
              Connecting your LinkedIn account
            </h1>
            <p className="text-caption text-muted-foreground leading-relaxed">
              Verifying permissions and securely linking your profile to AutoPulse.
            </p>
          </div>
        </div>
      )}

      {/* 2. Cancelled State */}
      {status === "cancelled" && (
        <div className="space-y-5" role="alert">
          <div className="size-10 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
            <XCircle className="size-5" strokeWidth={1.5} />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-h3 font-display text-foreground">
              LinkedIn connection was cancelled
            </h1>
            <p className="text-caption text-muted-foreground leading-relaxed">
              No changes were made to your AutoPulse account. You can reconnect whenever you are ready.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Button
              type="button"
              onClick={handleTryAgain}
              disabled={isRestarting}
            >
              {isRestarting ? "Opening LinkedIn..." : "Try again"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      )}

      {/* 3. Missing Parameters State */}
      {status === "missing_params" && (
        <div className="space-y-5" role="alert">
          <div className="size-10 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
            <AlertCircle className="size-5" strokeWidth={1.5} />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-h3 font-display text-foreground">
              Connection link not found
            </h1>
            <p className="text-caption text-muted-foreground leading-relaxed">
              This page is for finishing a LinkedIn connection. Go back to the dashboard to start.
            </p>
          </div>

          <div className="pt-2">
            <Button asChild>
              <Link href="/app">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      )}

      {/* 4. Error State */}
      {status === "error" && (
        <div className="space-y-5" role="alert">
          <div className="size-10 rounded-md bg-status-danger-bg border border-destructive/20 flex items-center justify-center text-destructive">
            <AlertCircle className="size-5" strokeWidth={1.5} />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-h3 font-display text-foreground">
              Connection unsuccessful
            </h1>
            <p className="text-caption text-muted-foreground leading-relaxed">
              {errorMessage || "An unexpected error occurred while connecting. Please try again."}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Button
              type="button"
              onClick={handleTryAgain}
              disabled={isRestarting}
            >
              {isRestarting ? "Opening LinkedIn..." : "Try again"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
