"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { AuthStatusLegend } from "../components/AuthStatusLegend";

interface ForgetPasswordClient {
  forgetPassword: (options: {
    email: string;
    redirectTo?: string;
  }) => Promise<{ data?: { status: boolean }; error?: { message?: string } }>;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Send password reset request via Neon Auth SDK
  // Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    try {
      // The redirectTo URL tells Neon Auth where to send the user with their reset token
      const client = authClient as unknown as ForgetPasswordClient;
      const result = await client.forgetPassword({
        email: email.trim(),
        redirectTo: "/auth/reset-password",
      });

      if (result?.error) {
        setError(result.error.message || "Failed to send reset email. Please try again.");
      } else {
        setIsSuccess(true);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while requesting password reset.";
      setError(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      {/* Minimal Top Header */}
      <header className="px-6 py-6 max-w-[1160px] w-full mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-[6px] bg-surface border border-line flex items-center justify-center text-signal group-hover:border-signal/40 transition-colors">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h5l3-7 4 14 3-7h3" />
            </svg>
          </div>
          <span className="font-geist font-normal tracking-tighter text-xl text-ink">
            AutoPulse
          </span>
        </Link>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column: Forgot password form (max 400px) */}
          <div className="w-full max-w-[400px] text-left">
            <h1 className="text-3xl font-geist font-normal tracking-tighter mb-2">
              Reset your password
            </h1>
            <p className="text-sm text-muted mb-6">
              Enter your account email and we will send you a link to reset your password.
            </p>

            {isSuccess ? (
              <div className="space-y-5">
                <div className="p-4 rounded-[10px] bg-signal-soft border border-[#93D7CE] text-sm text-ink space-y-2">
                  <div className="flex items-center gap-2 text-signal font-medium">
                    <svg
                      className="w-4 h-4 shrink-0"
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
                    <span>Check your email</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    If an account is registered with <strong className="text-ink">{email}</strong>, you will receive a password reset link shortly. Please check your spam folder if it does not appear within a few minutes.
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSuccess(false);
                      setEmail("");
                    }}
                    className="w-full py-2.5 px-4 rounded-[8px] border border-line bg-surface text-ink text-sm font-medium hover:bg-paper transition-colors cursor-pointer text-center"
                  >
                    Send to a different email
                  </button>

                  <Link
                    href="/auth/sign-in"
                    className="w-full py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover transition-colors cursor-pointer text-center shadow-xs"
                  >
                    Return to sign in
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-ink mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-[8px] bg-rejected-bg text-rejected-text text-sm leading-relaxed border border-rose-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending || !email.trim()}
                  className="w-full py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover disabled:opacity-60 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs active:translate-y-[1px]"
                >
                  {isPending ? "Sending link..." : "Send reset link"}
                </button>

                <div className="pt-2 text-center">
                  <Link
                    href="/auth/sign-in"
                    className="text-xs text-muted hover:text-ink inline-block"
                  >
                    Remember your password? <span className="text-signal underline">Sign in</span>
                  </Link>
                </div>
              </form>
            )}

            <div className="mt-8 pt-6 border-t border-line text-sm text-muted">
              <span>Do not have an account? </span>
              <Link
                href="/auth/sign-up"
                className="text-signal font-medium hover:underline"
              >
                Create your account
              </Link>
            </div>
          </div>

          {/* Right Column: Status legend (desktop only) */}
          <div className="hidden lg:flex justify-end">
            <AuthStatusLegend />
          </div>
        </div>
      </main>
    </div>
  );
}
