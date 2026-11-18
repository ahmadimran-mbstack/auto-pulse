"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// Forgot password page requesting an OTP code to reset user credentials
export default function ForgotPasswordPage() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Moves focus to error container when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Sends password reset code via the authentication service
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
        const msg =
          data.error?.message ||
          data.message ||
          "Failed to send reset code. Please try again.";
        setError(msg);
      } else {
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
      setError(message);
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

        {/* Primary submit action: 16px below last field */}
        <Button
          type="submit"
          disabled={isPending || !email.trim()}
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