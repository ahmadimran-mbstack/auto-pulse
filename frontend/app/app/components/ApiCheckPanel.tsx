"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

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

export function ApiCheckPanel({ apiUrl }: ApiCheckPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    data?: ApiResponse;
    methodUsed?: string;
    error?: string;
  } | null>(null);

  const checkApi = async () => {
    setLoading(true);
    setResult(null);

    let token: string | null = null;
    let methodUsed = "";

    // Method 1: Try authClient.token() as documented in Neon Auth JWT guide
    // Reference: https://neon.com/docs/auth/guides/plugins/jwt
    try {
      const clientWithToken = authClient as unknown as {
        token?: () => Promise<{ data?: { token?: string } }>;
      };
      if (typeof clientWithToken.token === "function") {
        const tokenRes = await clientWithToken.token();
        if (tokenRes?.data?.token) {
          token = tokenRes.data.token;
          methodUsed = "authClient.token()";
        }
      }
    } catch (err) {
      console.warn("authClient.token() call error:", err);
    }

    // Method 2: Fallback to reading the set-auth-jwt response header from getSession
    if (!token) {
      try {
        await authClient.getSession({
          fetchOptions: {
            onSuccess: (ctx: { response?: { headers?: Headers } }) => {
              const jwt = ctx.response?.headers?.get("set-auth-jwt");
              if (jwt) {
                token = jwt;
                methodUsed = "set-auth-jwt response header";
              }
            },
          },
        });
      } catch (err) {
        console.warn("authClient.getSession() fallback error:", err);
      }
    }

    // If both token acquisition methods failed
    if (!token) {
      setLoading(false);
      setResult({
        success: false,
        error:
          "Could not acquire token. Please verify that your Neon Auth session is active and that the JWT plugin is enabled on your Neon project.",
      });
      return;
    }

    // Call FastAPI backend GET /me with Bearer token
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
          methodUsed,
          error: `Backend returned HTTP ${response.status}: ${
            json?.error?.message || "Failed to verify token with FastAPI server."
          }`,
        });
        return;
      }

      setResult({
        success: true,
        methodUsed,
        data: json,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection refused";
      setResult({
        success: false,
        methodUsed,
        error: `Could not connect to FastAPI server at ${apiUrl}. Please check if the backend is running and that NEXT_PUBLIC_API_URL is configured correctly. (${message})`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-[16px] border border-line bg-surface text-left">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-geist font-normal tracking-tighter mb-1">API check</h2>
          <p className="text-sm text-muted">
            Fetch a fresh Neon JWT and verify your profile with the FastAPI backend.
          </p>
        </div>
        <button
          type="button"
          onClick={checkApi}
          disabled={loading}
          className="px-4 py-2 bg-signal text-surface rounded-[6px] text-sm font-medium hover:opacity-95 disabled:opacity-50 transition-opacity cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Checking..." : "Check API"}
        </button>
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div className="p-4 rounded-[6px] bg-paper border border-line text-sm text-muted">
          Acquiring fresh token and requesting profile from {apiUrl}/me...
        </div>
      )}

      {/* Success result view */}
      {result?.success && result.data && (
        <div className="p-4 rounded-[6px] bg-signal-soft border border-[#93D7CE] space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-signal">
            <svg
              className="w-4 h-4"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 8.5L6.5 12L13 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>FastAPI verification successful</span>
          </div>
          <div className="text-xs text-ink space-y-1 font-mono">
            <p>
              <strong className="font-sans font-medium text-muted">User ID:</strong>{" "}
              {result.data.id}
            </p>
            <p>
              <strong className="font-sans font-medium text-muted">Email:</strong>{" "}
              {result.data.email}
            </p>
            {result.data.name && (
              <p>
                <strong className="font-sans font-medium text-muted">Name:</strong>{" "}
                {result.data.name}
              </p>
            )}
            <p className="font-sans text-muted pt-1">
              Token method used: <code>{result.methodUsed}</code>
            </p>
          </div>
        </div>
      )}

      {/* Plain error state view */}
      {result && !result.success && (
        <div className="p-4 rounded-[6px] bg-rejected-bg border border-[#F5C2B9] text-sm text-rejected-text space-y-2">
          <p className="font-medium">Verification failed</p>
          <p className="text-xs text-ink leading-relaxed">{result.error}</p>
          {result.methodUsed && (
            <p className="text-xs text-muted">
              Token method attempted: <code>{result.methodUsed}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
