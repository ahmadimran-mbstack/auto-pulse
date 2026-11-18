"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AuthShell } from "../components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

interface LegacyResetClient {
  resetPassword?: (options: {
    newPassword: string;
    token: string;
  }) => Promise<{ data?: { status: boolean }; error?: { message?: string } }>;
}

// Inner form managing OTP code input and new password submission
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorRef = useRef<HTMLDivElement>(null);

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

  // Moves focus to error container when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Resend cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Requests a fresh OTP code
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

  // Submits the new password with OTP verification
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
      // If a reset token was provided via email link
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

      // Standard Email OTP password reset
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

  // Success confirmation screen
  if (isSuccess) {
    return (
      <div className="space-y-4 text-left font-normal">
        <Alert className="border-[#46a758]/30 bg-[#46a758]/10 text-[#62c073] font-normal">
          <CheckCircle2 className="size-4 text-[#62c073] shrink-0" aria-hidden="true" />
          <AlertDescription className="text-sm font-normal text-[var(--lp-text-body)]">
            Your password has been successfully updated. You can now sign in with your new password.
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          onClick={() => router.push("/auth/sign-in")}
          className="w-full h-10 rounded-[8px] bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] transition-colors !font-normal text-sm"
        >
          Sign in now
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="text-left font-normal">
      <div className="flex flex-col gap-3">
        {/* Email input field */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
            Email address
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-[8px] border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
          />
        </div>

        {/* 6-digit verification code input (shown unless token link is present) */}
        {!token && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="otp" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
                Verification code
              </Label>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0}
                className="text-[13px] leading-[1.2] text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] hover:underline font-normal disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Resend code"}
              </button>
            </div>
            <Input
              id="otp"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="h-10 rounded-[8px] border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 text-[var(--lp-text-heading)] font-mono text-center tracking-widest text-sm font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
            />
          </div>
        )}

        {/* Resend notice alert */}
        {resendNotice && (
          <p className="text-xs leading-[1.3] text-[var(--lp-ice)] font-normal">
            {resendNotice}
          </p>
        )}

        {/* New password input */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
            New password
          </Label>
          <div className="relative">
            <Input
              id="newPassword"
              name="newPassword"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-10 rounded-[8px] border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 pr-10 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)] cursor-pointer focus:outline-none transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="size-4 shrink-0" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Confirm password input */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
            Confirm new password
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="Retype your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 rounded-[8px] border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 pr-10 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)] cursor-pointer focus:outline-none transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="size-4 shrink-0" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inline error notice: 12px above, 8px 12px padding */}
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-3 px-3 py-2 rounded-[8px] bg-[#ff6369]/10 text-[#ff8589] text-sm border border-[#ff6369]/30 outline-none font-normal"
        >
          {error}
        </div>
      )}

      {/* Submit button: 16px below last field */}
      <Button
        type="submit"
        disabled={isPending || newPassword.length < 8 || newPassword !== confirmPassword}
        className="mt-4 w-full h-10 rounded-[8px] bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] transition-colors !font-normal text-sm flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
            <span>Resetting password...</span>
          </>
        ) : (
          "Reset password"
        )}
      </Button>
    </form>
  );
}

// Reset password page rendering the shared AuthShell split-screen layout
export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      description="Pick a password you do not use anywhere else."
      footer={
        <p className="text-sm text-muted-foreground text-left font-normal">
          <Link
            href="/auth/sign-in"
            className="text-foreground hover:underline font-normal"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="w-full py-8 text-center text-sm text-muted-foreground font-normal">
            Loading reset form...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}