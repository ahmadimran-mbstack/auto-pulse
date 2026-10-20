"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

interface AccountLinkingPanelProps {
  userEmail: string;
}

export function AccountLinkingPanel({ userEmail }: AccountLinkingPanelProps) {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [isLinking, setIsLinking] = useState(false);
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError === "google_link_failed"
      ? "Google OAuth provider is not configured in your Neon Console. Please add Google Client ID and Secret in your Neon project dashboard under Auth > Providers to enable Google linking."
      : null
  );

  // Check if Google is already linked to this account
  useEffect(() => {
    let isMounted = true;

    async function checkAccounts() {
      try {
        const client = authClient as unknown as {
          listAccounts?: () => Promise<{
            data?: Array<{ provider: string; accountId?: string }>;
            error?: { message?: string };
          }>;
        };

        if (typeof client.listAccounts === "function") {
          const res = await client.listAccounts();
          if (isMounted && res?.data && Array.isArray(res.data)) {
            const hasGoogle = res.data.some((acc) => acc.provider === "google");
            setIsGoogleLinked(hasGoogle);
          }
        }
      } catch {
        // Silently ignore check errors
      }
    }

    checkAccounts();

    return () => {
      isMounted = false;
    };
  }, []);

  // Trigger Google account linking via Neon Auth linkSocial
  const handleLinkGoogle = async () => {
    setIsLinking(true);
    setError(null);

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const client = authClient as unknown as {
        linkSocial?: (options: {
          provider: "google";
          callbackURL: string;
          errorCallbackURL?: string;
        }) => Promise<{ error?: { message?: string } }>;
      };

      if (typeof client.linkSocial === "function") {
        const result = await client.linkSocial({
          provider: "google",
          callbackURL: `${origin}/app`,
          errorCallbackURL: `${origin}/app?error=google_link_failed`,
        });

        if (result?.error) {
          const msg =
            result.error.message?.toLowerCase().includes("provider") ||
            result.error.message?.toLowerCase().includes("not configured")
              ? "Google OAuth provider is not enabled in your Neon Console. Please add Google Client ID and Secret in Neon Auth > Providers."
              : result.error.message || "Failed to link Google account.";
          setError(msg);
          setIsLinking(false);
        }
      } else {
        // Fallback to signIn.social if linkSocial is not exposed directly
        await authClient.signIn.social({
          provider: "google",
          callbackURL: `${origin}/app`,
          newUserCallbackURL: `${origin}/app`,
          errorCallbackURL: `${origin}/app?error=google_link_failed`,
        });
      }
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : "";
      const friendlyMessage =
        rawMessage.toLowerCase().includes("provider") ||
        rawMessage.toLowerCase().includes("not configured") ||
        rawMessage.toLowerCase().includes("oauth")
          ? "Google OAuth provider is not enabled in your Neon Console. To enable Google linking, configure your Google Client ID and Secret in your Neon project under Auth > Providers."
          : rawMessage || "Failed to link Google account. Please ensure Google provider is enabled in Neon console.";
      setError(friendlyMessage);
      setIsLinking(false);
    }
  };

  return (
    <div className="p-7 rounded-[16px] border border-line bg-surface text-left card-subtle-shadow space-y-6">
      <div>
        <h2 className="text-xl font-geist font-normal tracking-tighter text-ink mb-1">
          Connected Accounts
        </h2>
        <p className="text-sm text-muted">
          Manage identity providers and publishing destinations tied to {userEmail}.
        </p>
      </div>

      <div className="space-y-4">
        {/* Google Authentication Row */}
        <div className="p-4 rounded-[10px] border border-line bg-paper/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[8px] bg-surface border border-line flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">Google Sign-In</p>
                {isGoogleLinked && (
                  <span className="px-2 py-0.5 rounded-full bg-signal-soft text-signal text-[10px] font-medium border border-[#93D7CE]">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {isGoogleLinked
                  ? "Your Google account is linked and active."
                  : "Link to sign in seamlessly with your Google workspace identity."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLinkGoogle}
            disabled={isLinking || isGoogleLinked}
            className={`px-4 py-2 border rounded-[8px] text-sm font-medium transition-colors shrink-0 ${
              isGoogleLinked
                ? "border-signal/30 bg-signal-soft/50 text-signal cursor-default"
                : "border-line bg-surface hover:bg-paper text-ink cursor-pointer disabled:opacity-50"
            }`}
          >
            {isGoogleLinked
              ? "Connected"
              : isLinking
              ? "Connecting..."
              : "Link Google Account"}
          </button>
        </div>

        {/* LinkedIn Destination Row */}
        <div className="p-4 rounded-[10px] border border-line bg-paper/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[8px] bg-[#0A66C2] text-white flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.3a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">LinkedIn Publishing Channel</p>
                <span className="px-2 py-0.5 rounded-full bg-signal-soft text-signal text-[10px] font-medium border border-[#93D7CE]">
                  Ready for Setup
                </span>
              </div>
              <p className="text-xs text-muted">
                Requires official OAuth approval before drafts can be dispatched.
              </p>
            </div>
          </div>

          <span className="text-xs text-muted font-medium self-center sm:self-auto">
            Configured during onboarding
          </span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-[10px] bg-rejected-bg text-rejected-text text-xs leading-relaxed border border-rose-200"
        >
          {error}
        </div>
      )}
    </div>
  );
}
