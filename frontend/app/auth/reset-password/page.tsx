"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authToast } from "@/lib/auth-toast";
import { AuthShell } from "../components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [resendCooldown, setResendCooldown] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    otp?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  // Shows URL-based reset errors as a toast on mount
  useEffect(() => {
    if (urlError) {
      authToast.error(urlError, { id: "reset-password-url-error" });
    }
  }, [urlError]);

  // Resend cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Requests a fresh OTP code
  const handleResendCode = async () => {
    authToast.dismiss();
    const cleanEmail = email.trim();
    if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail)) {
      setFieldErrors((prev) => ({
        ...prev,
        email: "Please enter your email address to request a new code.",
      }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, email: undefined }));

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

      if (res.status === 429) {
        const waitSeconds = Number(
          data?.retry_after || res.headers.get("Retry-After") || 60
        );
        setResendCooldown(waitSeconds);
        authToast.warning("Too many attempts", {
          id: "reset-password-rate-limit",
          description: `Please wait ${waitSeconds} seconds before requesting another code.`,
        });
        return;
      }

      if (!res.ok || data.error) {
        authToast.error(
          data.error?.message || "Failed to resend code. Please try again.",
          { id: "reset-password-resend-error" }
        );
      } else {
        setResendCooldown(60);
        authToast.success("Code sent", {
          id: "reset-password-code-sent",
          description: `A fresh verification code was sent to ${cleanEmail}.`,
        });
      }
    } catch {
      authToast.error(
        "Failed to resend verification code. Please check your network connection.",
        { id: "reset-password-resend-error" }
      );
    }
  };

  // Validates email, OTP, and password fields inline before submitting
  const validateFields = (cleanEmail: string, cleanOtp: string) => {
    const nextErrors: {
      email?: string;
      otp?: string;
      newPassword?: string;
      confirmPassword?: string;
    } = {};

    if (!cleanEmail) {
      nextErrors.email = "Please enter your account email address.";
    } else if (!EMAIL_PATTERN.test(cleanEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!token && (!cleanOtp || cleanOtp.length < 6)) {
      nextErrors.otp =
        "Please enter the complete 6-digit verification code sent to your email.";
    }

    if (newPassword.length < 8) {
      nextErrors.newPassword = "Password must be at least 8 characters long.";
    }

    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword =
        "Passwords do not match. Please retype your password.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Submits the new password with OTP verification
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    authToast.dismiss();

    const cleanEmail = email.trim();
    const cleanOtp = otp.trim();

    if (!validateFields(cleanEmail, cleanOtp)) {
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
            authToast.error(
              result.error.message ||
                "Failed to reset password. The link may have expired.",
              { id: "reset-password-error" }
            );
            setIsPending(false);
            return;
          }

          authToast.success(
            "Your password has been successfully updated. You can now sign in with your new password.",
            { id: "reset-password-success" }
          );
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

      if (res.status === 429) {
        const waitSeconds = Number(
          data?.retry_after || res.headers.get("Retry-After") || 60
        );
        authToast.warning("Too many attempts", {
          id: "reset-password-rate-limit",
          description: `Please wait ${waitSeconds} seconds before trying again.`,
        });
        return;
      }

      if (!res.ok || data.error || data.code === "INVALID_OTP") {
        const msg =
          data.code === "INVALID_OTP"
            ? "Invalid or expired verification code. Please check your inbox or request a new code."
            : data.error?.message ||
              data.message ||
              "Failed to reset password. Please try again.";
        authToast.error(msg, { id: "reset-password-error" });
      } else {
        authToast.success(
          "Your password has been successfully updated. You can now sign in with your new password.",
          { id: "reset-password-success" }
        );
        setIsSuccess(true);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while resetting your password.";
      authToast.error(message, { id: "reset-password-error" });
    } finally {
      setIsPending(false);
    }
  };

  // Success confirmation action without standalone banner
  if (isSuccess) {
    return (
      <div className="text-left font-normal">
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
    <form noValidate onSubmit={handleSubmit} className="text-left font-normal">
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
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${
              fieldErrors.email
                ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
            }`}
          />
          {/* Inline field error for email */}
          {fieldErrors.email && (
            <p id="email-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
              {fieldErrors.email}
            </p>
          )}
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
              aria-invalid={Boolean(fieldErrors.otp)}
              aria-describedby={fieldErrors.otp ? "otp-error" : undefined}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ""));
                if (fieldErrors.otp) {
                  setFieldErrors((prev) => ({ ...prev, otp: undefined }));
                }
              }}
              className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 text-[var(--lp-text-heading)] font-mono text-center tracking-widest text-sm font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${
                fieldErrors.otp
                  ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                  : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
              }`}
            />
            {/* Inline field error for OTP code */}
            {fieldErrors.otp && (
              <p id="otp-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
                {fieldErrors.otp}
              </p>
            )}
          </div>
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={newPassword}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby={
                fieldErrors.newPassword ? "new-password-error" : undefined
              }
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (fieldErrors.newPassword) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    newPassword: undefined,
                  }));
                }
              }}
              className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 pr-10 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${
                fieldErrors.newPassword
                  ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                  : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
              }`}
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
          {/* Inline field error for new password */}
          {fieldErrors.newPassword && (
            <p id="new-password-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
              {fieldErrors.newPassword}
            </p>
          )}
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
              autoComplete="new-password"
              placeholder="Retype your new password"
              value={confirmPassword}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword
                  ? "confirm-password-error"
                  : undefined
              }
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    confirmPassword: undefined,
                  }));
                }
              }}
              className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 pr-10 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${
                fieldErrors.confirmPassword
                  ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                  : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
              }`}
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
          {/* Inline field error for password confirmation */}
          {fieldErrors.confirmPassword && (
            <p id="confirm-password-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>
      </div>

      {/* Submit button: 16px below last field */}
      <Button
        type="submit"
        disabled={isPending}
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
