"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthStatusLegend } from "../components/AuthStatusLegend";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Send password reset OTP code via Neon Auth Email OTP endpoint
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          type: "forget-password",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        const msg = data.error?.message || data.message || "Failed to send reset code. Please try again.";
        setError(msg);
      } else {
        // Redirect directly to the reset-password page with email prefilled
        router.push(`/auth/reset-password?email=${encodeURIComponent(cleanEmail)}`);
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
              Enter your account email and we will send you a verification code to reset your password.
            </p>

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
                {isPending ? "Sending code..." : "Send reset code"}
              </button>

              <div className="pt-2 text-center space-y-2">
                <div>
                  <Link
                    href={`/auth/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
                    className="text-xs text-muted hover:text-ink inline-block"
                  >
                    Already have a reset code? <span className="text-signal underline">Enter code</span>
                  </Link>
                </div>
                <div>
                  <Link
                    href="/auth/sign-in"
                    className="text-xs text-muted hover:text-ink inline-block"
                  >
                    Remember your password? <span className="text-signal underline">Sign in</span>
                  </Link>
                </div>
              </div>
            </form>

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
