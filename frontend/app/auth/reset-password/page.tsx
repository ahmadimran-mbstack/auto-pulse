"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AuthStatusLegend } from "../components/AuthStatusLegend";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";

interface LegacyResetClient {
  resetPassword?: (options: {
    newPassword: string;
    token: string;
  }) => Promise<{ data?: { status: boolean }; error?: { message?: string } }>;
}

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

  // Focus error container when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

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
      // If a token was provided via link, use token reset
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
    <Card className="w-full max-w-[400px] p-6 sm:p-8 bg-card border-border text-left mx-auto lg:mx-0">
      <h1 className="text-title font-display text-foreground mb-2">
        Set new password
      </h1>
      <p className="text-body text-muted-foreground mb-6">
        {token
          ? "Choose a secure password for your AutoPulse account."
          : `Enter the 6-digit code sent to ${email || "your email"} and your new password.`}
      </p>

      {isSuccess ? (
        <div className="space-y-4">
          <Alert className="border-signal-line bg-signal-soft">
            <CheckCircle2 className="size-4 text-primary shrink-0" aria-hidden="true" />
            <AlertTitle className="text-meta font-medium text-foreground">
              Password updated
            </AlertTitle>
            <AlertDescription className="text-caption text-muted-foreground leading-relaxed">
              Your password has been changed successfully. You can now sign in with your new credentials.
            </AlertDescription>
          </Alert>

          <Button
            type="button"
            onClick={() => router.push("/auth/sign-in")}
            className="w-full"
          >
            Sign in with new password
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email address field */}
          <div className="space-y-1.5">
            <Label htmlFor="email">
              Account email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
          </div>

          {/* Verification Code field (when not using URL token) */}
          {!token && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="otp">
                  6-digit reset code
                </Label>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0}
                  className="text-caption text-primary hover:underline disabled:text-muted-foreground disabled:no-underline cursor-pointer disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend code"}
                </button>
              </div>
              <Input
                id="otp"
                name="otp"
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
                placeholder="123456"
                className="font-mono text-center tracking-widest text-lead tabular-nums"
              />
            </div>
          )}

          {/* New password field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="newPassword">
                New password
              </Label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-caption text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              id="newPassword"
              name="newPassword"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimum 8 characters"
            />
          </div>

          {/* Confirm password field */}
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">
              Confirm new password
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Re-enter your new password"
            />
          </div>

          {resendNotice && (
            <Alert className="border-signal-line bg-signal-soft">
              <AlertDescription className="text-caption text-foreground">
                {resendNotice}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <Alert variant="destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <AlertDescription className="text-meta">
                  {error}
                </AlertDescription>
              </Alert>
            </div>
          )}

          <Button
            type="submit"
            disabled={isPending || !newPassword || !confirmPassword || (!token && !otp)}
            className="w-full"
          >
            {isPending ? "Updating password..." : "Update password"}
          </Button>
        </form>
      )}

      <div className="mt-6 pt-5 border-t border-border text-meta text-muted-foreground text-left">
        <span>Remember your password? </span>
        <Link
          href="/auth/sign-in"
          className="text-primary font-medium hover:underline"
        >
          Sign in
        </Link>
      </div>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Minimal Top Header */}
      <header className="px-6 py-6 page-container w-full mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="size-7 rounded-md bg-card border border-border flex items-center justify-center text-primary group-hover:border-primary/40 transition-colors">
            <Activity className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <span className="font-display font-semibold text-lg text-foreground">
            AutoPulse
          </span>
        </Link>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 page-container w-full mx-auto px-6 py-8 md:py-12 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column wrapped in Suspense for useSearchParams */}
          <Suspense
            fallback={
              <Card className="w-full max-w-[400px] p-6 sm:p-8 bg-card border-border text-left mx-auto lg:mx-0">
                <p className="text-body text-muted-foreground">Loading password reset...</p>
              </Card>
            }
          >
            <ResetPasswordForm />
          </Suspense>

          {/* Right Column: Status legend (quiet panel on desktop only) */}
          <div className="hidden lg:flex justify-end">
            <AuthStatusLegend />
          </div>
        </div>
      </main>
    </div>
  );
}
