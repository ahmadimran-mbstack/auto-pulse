"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authToast } from "@/lib/auth-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

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

  const [otp, setOtp] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);

  // Shows the neutral check-your-email notice as an info toast with a Sign in action
  useEffect(() => {
    authToast.info("Check your email.", {
      id: "verify-otp-check-email",
      description: "If you already have an account, sign in instead.",
      action: {
        label: "Sign in",
        onClick: () =>
          router.push(`/auth/sign-in?email=${encodeURIComponent(email)}`),
      },
    });
  }, [email, router]);

  // Tick down the resend cooldown timer every second
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Request a fresh verification code and follow the server's cooldown on 429
  const handleResendOtp = async () => {
    if (countdown > 0 || isResending) return;
    authToast.dismiss();
    setOtpError(null);
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
        authToast.warning("Too many attempts", {
          id: "verify-otp-rate-limit",
          description: `Please wait ${waitSeconds} seconds before requesting another code.`,
        });
        return;
      }

      if (!res.ok || data?.error) {
        authToast.error(
          data?.error?.message ||
            data?.message ||
            "Failed to send code. Please try again.",
          { id: "verify-otp-resend-error" }
        );
        return;
      }

      setCountdown(60);
      authToast.success("A new verification code was sent to your email.", {
        id: "verify-otp-code-sent",
      });
    } catch {
      authToast.error(
        "An error occurred while sending the verification code.",
        { id: "verify-otp-resend-error" }
      );
    } finally {
      setIsResending(false);
    }
  };

  // Submit the 6-digit verification code to verify the account email
  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    authToast.dismiss();

    const cleanOtp = otp.trim();
    if (cleanOtp.length < 6) {
      setOtpError("Please enter the complete 6-digit code.");
      return;
    }

    setOtpError(null);
    setIsPending(true);

    try {
      const client = authClient as unknown as VerifyEmailOtpClient;
      const result = await client.emailOtp.verifyEmail({
        email,
        otp: cleanOtp,
      });

      if (result?.error) {
        authToast.error(
          result.error.message || "Invalid or expired code. Please try again.",
          { id: "verify-otp-error" }
        );
        setIsPending(false);
        return;
      }

      document.cookie =
        "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";
      authToast.success("Email verified. Redirecting to setup...", {
        id: "verify-otp-verified",
      });
      const returnTo =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("returnTo")
          : null;
      const safeReturn = returnTo && returnTo.startsWith("/app/") ? returnTo : "/onboarding";
      router.replace(safeReturn);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred while verifying the code.";
      authToast.error(message, { id: "verify-otp-error" });
      setIsPending(false);
    }
  };

  return (
    <form noValidate onSubmit={handleVerifyOtp} className="text-left font-normal">
      <div className="flex flex-col gap-3">
        {/* Code input field */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="otp"
              className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]"
            >
              Verification code
            </Label>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={countdown > 0 || isPending || isResending}
              className="text-[13px] leading-[1.2] text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] hover:underline font-normal disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
            aria-invalid={Boolean(otpError)}
            aria-describedby={otpError ? "otp-error" : undefined}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, ""));
              if (otpError) setOtpError(null);
            }}
            className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 text-[var(--lp-text-heading)] font-mono text-center tracking-widest text-sm font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${
              otpError
                ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
            }`}
          />
          {/* Inline field error for incomplete 6-digit code */}
          {otpError && (
            <p id="otp-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
              {otpError}
            </p>
          )}
        </div>
      </div>

      {/* Verification submission button: 16px below last field */}
      <Button
        type="submit"
        disabled={isPending}
        className="mt-4 w-full h-10 rounded-[8px] bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] transition-colors !font-normal text-sm flex items-center justify-center gap-2"
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
      <div className="text-center mt-3">
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
