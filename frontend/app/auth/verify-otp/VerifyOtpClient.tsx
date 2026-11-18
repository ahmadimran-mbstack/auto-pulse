"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2 } from "lucide-react";

interface VerifyEmailOtpClient {
  emailOtp: {
    verifyEmail: (options: {
      email: string;
      otp: string;
    }) => Promise<{ data?: unknown; error?: { message?: string } }>;
  };
}

interface VerifyOtpClientProps {
  email: string;
}

// Handles 6-digit email verification without sending on load or allowing arbitrary email input
export function VerifyOtpClient({ email }: VerifyOtpClientProps) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);

  const [otp, setOtp] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);

  // Move focus to the error banner when a validation or server error appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Tick down the resend cooldown timer every second
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Request a fresh verification code and follow the server's cooldown on 429
  const handleResendOtp = async () => {
    if (countdown > 0 || isResending) return;
    setError(null);
    setSuccessMessage(null);
    setIsResending(true);

    try {
      const res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          type: "email-verification",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const waitSeconds = Number(
          data?.retry_after || res.headers.get("Retry-After") || 60
        );
        setCountdown(waitSeconds);
        setError(
          data?.message ||
            `Please wait ${waitSeconds} seconds before requesting another code.`
        );
        return;
      }

      if (!res.ok || data?.error) {
        setError(
          data?.error?.message ||
            data?.message ||
            "Failed to send code. Please try again."
        );
        return;
      }

      setCountdown(60);
      setSuccessMessage("A new verification code was sent to your email.");
    } catch {
      setError("An error occurred while sending the verification code.");
    } finally {
      setIsResending(false);
    }
  };

  // Submit the 6-digit verification code to verify the account email
  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanOtp = otp.trim();
    if (cleanOtp.length < 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setIsPending(true);

    try {
      const client = authClient as unknown as VerifyEmailOtpClient;
      const result = await client.emailOtp.verifyEmail({
        email,
        otp: cleanOtp,
      });

      if (result?.error) {
        setError(
          result.error.message || "Invalid or expired code. Please try again."
        );
        setIsPending(false);
        return;
      }

      document.cookie =
        "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";
      setSuccessMessage("Email verified. Redirecting to setup...");
      router.replace("/onboarding");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred while verifying the code.";
      setError(message);
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleVerifyOtp} className="space-y-4 text-left font-normal">
      {/* Neutral notice for both new and existing accounts */}
      <Alert className="border-[var(--lp-border)] bg-[var(--lp-surface)] text-[var(--lp-text-body)] font-normal">
        <AlertDescription className="text-sm font-normal">
          Check your email. If you already have an account,{" "}
          <Link
            href={`/auth/sign-in?email=${encodeURIComponent(email)}`}
            className="text-[var(--lp-ice)] hover:underline"
          >
            sign in instead
          </Link>
          .
        </AlertDescription>
      </Alert>

      {/* Success notification */}
      {successMessage && (
        <Alert className="border-[#46a758]/30 bg-[#46a758]/10 text-[#62c073] font-normal">
          <CheckCircle2
            className="size-4 text-[#62c073] shrink-0"
            aria-hidden="true"
          />
          <AlertDescription className="text-sm font-normal text-[var(--lp-text-body)]">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Code input field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="otp"
            className="text-sm font-normal text-[var(--lp-text-heading)]"
          >
            Verification code
          </Label>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={countdown > 0 || isPending || isResending}
            className="text-xs text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] hover:underline font-normal disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
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
          className="h-11 rounded-lg border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 text-[var(--lp-text-heading)] font-mono text-center tracking-widest text-lg font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
        />
      </div>

      {/* Inline error notice */}
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="p-3 rounded-lg bg-[#ff6369]/10 text-[#ff8589] text-sm border border-[#ff6369]/30 outline-none font-normal"
        >
          {error}
        </div>
      )}

      {/* Verification submission button */}
      <Button
        type="submit"
        disabled={isPending || otp.trim().length < 6}
        className="w-full h-11 rounded-lg bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] transition-colors font-normal text-sm flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
            <span>Verifying...</span>
          </>
        ) : (
          "Verify code"
        )}
      </Button>

      {/* Link back to sign up to use a different email */}
      <div className="text-center pt-2">
        <Link
          href="/auth/sign-up"
          className="text-xs text-muted-foreground hover:text-foreground underline font-normal"
        >
          Use a different email address
        </Link>
      </div>
    </form>
  );
}

