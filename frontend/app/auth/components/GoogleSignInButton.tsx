"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

interface GoogleSignInButtonProps {
  text?: string;
}

export function GoogleSignInButton({
  text = "Continue with Google",
}: GoogleSignInButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trigger Google OAuth sign-in via Neon Auth SDK
  // Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
  const handleGoogleSignIn = async () => {
    setIsPending(true);
    setError(null);

    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/app",
        newUserCallbackURL: "/app",
        errorCallbackURL: "/auth/sign-in",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to initiate Google sign in. Please try again.";
      setError(message);
      setIsPending(false);
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-[8px] border border-line bg-surface text-ink text-sm font-medium hover:bg-paper hover:border-signal/40 disabled:opacity-60 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs active:translate-y-[1px]"
      >
        {/* Google G logo SVG */}
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
        <span>{isPending ? "Connecting to Google..." : text}</span>
      </button>

      {error && (
        <p className="mt-2 text-xs text-rejected-text text-left">{error}</p>
      )}
    </div>
  );
}
