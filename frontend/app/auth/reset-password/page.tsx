"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AuthStatusLegend } from "../components/AuthStatusLegend";

interface LegacyResetClient {
  resetPassword?: (options: {
    newPassword: string;
    token: string;
  }) => Promise<{ data?: { status: boolean }; error?: { message?: string } }>;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialEmail = searchParams.get("email") || "";
  const token = searchParams.get("token");
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(urlError || null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Request a fresh OTP code
  const handleResendCode = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter your email address to request a new code.");
      return;
    }

    setError(null);
    setResendNotice(null);

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
        setError(data.error?.message || "Failed to resend code. Please try again.");
      } else {
        setResendCooldown(60);
        setResendNotice(`A fresh verification code was sent to ${cleanEmail}.`);
      }
    } catch {
      setError("Failed to resend verification code. Please check your network connection.");
    }
  };

  // Submit password reset
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResendNotice(null);

    const cleanEmail = email.trim();
    const cleanOtp = otp.trim();

    if (!cleanEmail) {
      setError("Please enter your account email address.");
      return;
    }

    if (!token && (!cleanOtp || cleanOtp.length < 6)) {
      setError("Please enter the complete 6-digit verification code sent to your email.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please retype your password.");
      return;
    }

    setIsPending(true);

    try {
      // If a token was provided via link, use legacy token reset
      if (token) {
        const client = authClient as unknown as LegacyResetClient;
        if (typeof client.resetPassword === "function") {
          const result = await client.resetPassword({
            newPassword,
            token,
          });

          if (result?.error) {
            setError(result.error.message || "Failed to reset password. The link may have expired.");
            setIsPending(false);
            return;
          }

          setIsSuccess(true);
          setIsPending(false);
          return;
        }
      }

      // Standard Neon Auth Email OTP password reset
      const res = await fetch("/api/auth/email-otp/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          otp: cleanOtp,
          password: newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error || data.code === "INVALID_OTP") {
        const msg =
          data.code === "INVALID_OTP"
            ? "Invalid or expired verification code. Please check your inbox or request a new code."
            : data.error?.message || data.message || "Failed to reset password. Please try again.";
        setError(msg);
      } else {
        setIsSuccess(true);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while resetting your password.";
      setError(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="w-full max-w-[400px] text-left">
      <h1 className="text-3xl font-geist font-normal tracking-tighter mb-2">
        Set new password
      </h1>
      <p className="text-sm text-muted mb-6">
        {token
          ? "Choose a secure password for your AutoPulse account."
          : `Enter the 6-digit code sent to ${email || "your email"} and your new password.`}
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
              <span>Password updated</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Your password has been changed successfully. You can now sign in with your new credentials.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/auth/sign-in")}
            className="w-full py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover transition-colors cursor-pointer text-center shadow-xs"
          >
            Sign in with new password
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email address field */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Account email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
            />
          </div>

          {/* Verification Code field (when not using URL token) */}
          {!token && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="otp"
                  className="block text-sm font-medium text-ink"
                >
                  6-digit reset code
                </label>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0}
                  className="text-xs text-signal hover:underline disabled:text-muted disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend code"}
                </button>
              </div>
              <input
                id="otp"
                name="otp"
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
                placeholder="123456"
                className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink font-mono text-center tracking-widest text-lg placeholder:text-muted/40 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
              />
            </div>
          )}

          {/* New password field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-ink"
              >
                New password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-xs text-muted hover:text-ink cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="newPassword"
              name="newPassword"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
            />
          </div>

          {/* Confirm password field */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Re-enter your new password"
              className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
            />
          </div>

          {resendNotice && (
            <div className="p-3 rounded-[8px] bg-signal-soft border border-[#93D7CE] text-xs text-ink">
              {resendNotice}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-[8px] bg-rejected-bg text-rejected-text text-sm leading-relaxed border border-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || !newPassword || !confirmPassword || (!token && !otp)}
            className="w-full py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover disabled:opacity-60 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs active:translate-y-[1px]"
          >
            {isPending ? "Updating password..." : "Update password"}
          </button>
        </form>
      )}

      <div className="mt-8 pt-6 border-t border-line text-sm text-muted">
        <span>Remember your password? </span>
        <Link
          href="/auth/sign-in"
          className="text-signal font-medium hover:underline"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
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
          {/* Left Column wrapped in Suspense for useSearchParams */}
          <Suspense
            fallback={
              <div className="w-full max-w-[400px] text-left text-sm text-muted">
                Loading password reset...
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>

          {/* Right Column: Status legend (desktop only) */}
          <div className="hidden lg:flex justify-end">
            <AuthStatusLegend />
          </div>
        </div>
      </main>
    </div>
  );
}
