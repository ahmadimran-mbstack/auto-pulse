"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <p className="text-sm text-muted-foreground text-left">
          Remember your password?{" "}
          <Link
            href="/auth/sign-in"
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        {/* Email input field */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-foreground">
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
            className="h-12 rounded-[8px] border-border-light dark:border-border bg-white dark:bg-card text-foreground"
          />
        </div>

        {/* Inline error notice */}
        {error && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="p-3 rounded-[8px] bg-status-danger-bg text-status-danger-fg text-sm border border-destructive/20 outline-none"
          >
            {error}
          </div>
        )}

        {/* Primary submit action */}
        <Button
          type="submit"
          disabled={isPending || !email.trim()}
          className="w-full h-12 rounded-[8px] bg-ink text-white hover:bg-neutral-800 dark:bg-white dark:text-ink dark:hover:bg-neutral-200 transition-colors font-medium text-sm"
        >
          {isPending ? "Sending code..." : "Send reset code"}
        </Button>
      </form>
    </AuthShell>
  );
}
