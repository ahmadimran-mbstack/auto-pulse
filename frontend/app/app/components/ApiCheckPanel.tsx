"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface ApiResponse {
  id?: string;
  email?: string;
  name?: string;
  error?: {
    code: string;
    message: string;
  };
}

interface ApiCheckPanelProps {
  apiUrl: string;
}

// Dev-only helper to fetch a fresh token using Neon Auth client methods
async function fetchFreshToken(): Promise<string | null> {
  let token: string | null = null;

  try {
    const clientWithToken = authClient as unknown as {
      token?: () => Promise<{ data?: { token?: string } }>;
    };
    if (typeof clientWithToken.token === "function") {
      const tokenRes = await clientWithToken.token();
      if (tokenRes?.data?.token) {
        token = tokenRes.data.token;
      }
    }
  } catch (err) {
    console.warn("authClient.token() error:", err);
  }

  if (!token) {
    try {
      await authClient.getSession({
        fetchOptions: {
          onSuccess: (ctx: { response?: { headers?: Headers } }) => {
            const jwt = ctx.response?.headers?.get("set-auth-jwt");
            if (jwt) {
              token = jwt;
            }
          },
        },
      });
    } catch (err) {
      console.warn("authClient.getSession() fallback error:", err);
    }
  }

  return token;
}

export function ApiCheckPanel({ apiUrl }: ApiCheckPanelProps) {
  const [loading, setLoading] = useState(false);
  const [copyingToken, setCopyingToken] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    data?: ApiResponse;
    methodUsed?: string;
    error?: string;
  } | null>(null);

  const isDev = process.env.NODE_ENV !== "production";

  // Copies a fresh API token to the user clipboard without logging or rendering it
  const handleCopyToken = async () => {
    setCopyingToken(true);
    try {
      const freshToken = await fetchFreshToken();
      if (!freshToken) {
        toast.error("Could not acquire fresh token");
        return;
      }
      await navigator.clipboard.writeText(freshToken);
      toast.success("Fresh API token copied to clipboard");
    } catch {
      toast.error("Failed to copy token to clipboard");
    } finally {
      setCopyingToken(false);
    }
  };

  const checkApi = async () => {
    setLoading(true);
    setResult(null);

    const token = await fetchFreshToken();

    if (!token) {
      setLoading(false);
      setResult({
        success: false,
        error:
          "Could not acquire token. Please verify that your Neon Auth session is active and that the JWT plugin is enabled on your Neon project.",
      });
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const json = await response.json();

      if (!response.ok) {
        setResult({
          success: false,
          error: `Backend returned HTTP ${response.status}: ${
            json?.error?.message || "Failed to verify token with FastAPI server."
          }`,
        });
        return;
      }

      setResult({
        success: true,
        data: json,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection refused";
      setResult({
        success: false,
        error: `Could not connect to FastAPI server at ${apiUrl}. Please check if the backend is running and that NEXT_PUBLIC_API_URL is configured correctly. (${message})`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="text-left">
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4">
        <div>
          <CardTitle>API check</CardTitle>
          <CardDescription className="mt-1">
            Fetch a fresh Neon JWT and verify your profile with the FastAPI backend.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Copy token button: only rendered in non-production environments */}
          {isDev && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyToken}
              disabled={copyingToken}
              className="gap-1.5"
            >
              {copyingToken ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              <span>Copy token</span>
            </Button>
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={checkApi}
            disabled={loading}
            className="gap-1.5"
          >
            {loading && <Loader2Icon className="size-3.5 animate-spin" />}
            <span>{loading ? "Checking..." : "Check API"}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Loading state indicator */}
        {loading && (
          <div className="p-4 rounded-md bg-muted border border-border text-sm text-muted-foreground">
            Acquiring fresh token and requesting profile from {apiUrl}/me...
          </div>
        )}

        {/* Success result view */}
        {result?.success && result.data && (
          <div className="p-4 rounded-md bg-signal-soft border border-signal-line space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <CheckIcon className="size-4 text-primary" strokeWidth={2} />
              <span>FastAPI verification successful</span>
            </div>
            <div className="text-xs text-foreground space-y-1 font-mono">
              <p>
                <strong className="font-sans font-medium text-muted-foreground">User ID:</strong>{" "}
                {result.data.id}
              </p>
              <p>
                <strong className="font-sans font-medium text-muted-foreground">Email:</strong>{" "}
                {result.data.email}
              </p>
              {result.data.name && (
                <p>
                  <strong className="font-sans font-medium text-muted-foreground">Name:</strong>{" "}
                  {result.data.name}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error state view */}
        {result && !result.success && (
          <div className="p-4 rounded-md bg-status-danger-bg border border-status-danger-fg/20 text-sm text-status-danger-fg space-y-2">
            <p className="font-medium">Verification failed</p>
            <p className="text-xs text-foreground leading-relaxed">{result.error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
