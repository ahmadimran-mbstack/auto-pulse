"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import { authToast } from "@/lib/auth-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Forgot password page requesting an OTP code to reset user credentials
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Sends password reset code via the authentication service
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    authToast.dismiss();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setEmailError("Please enter your email address.");
      return;
    }

    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setEmailError(null);
    setIsPending(true);

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
        authToast.warning("Too many attempts", {
          id: "forgot-password-rate-limit",
          description: `Please wait ${waitSeconds} seconds before trying again.`,
        });
        return;
      }

      if (!res.ok || data.error) {
        const msg =
          data.error?.message ||
          data.message ||
          "Failed to send reset code. Please try again.";
        authToast.error(msg, { id: "forgot-password-error" });
      } else {
        authToast.success("Reset code sent", {
          id: "forgot-password-sent",
          description: `We sent a verification code to ${cleanEmail}.`,
        });
        // Navigate directly to the reset-password page with email prefilled
        router.push(
          `/auth/reset-password?email=${encodeURIComponent(cleanEmail)}`
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while requesting password reset.";
      authToast.error(message, { id: "forgot-password-error" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we will send you a link."
      footer={
        <p className="text-sm text-muted-foreground text-left font-normal">
          Remember your password?{" "}
          <Link
            href="/auth/sign-in"
            className="text-foreground hover:underline font-normal"
          >
            Sign in
          </Link>
        </p>
      }
    >
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
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "email-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${
                emailError
                  ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                  : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
              }`}
            />
            {/* Inline field error for email validation */}
            {emailError && (
              <p id="email-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
                {emailError}
              </p>
            )}
          </div>
        </div>

        {/* Primary submit action: 16px below last field */}
        <Button
          type="submit"
          disabled={isPending}
          className="mt-4 w-full h-10 rounded-[8px] bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] transition-colors !font-normal text-sm flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
              <span>Sending code...</span>
            </>
          ) : (
            "Send reset code"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
