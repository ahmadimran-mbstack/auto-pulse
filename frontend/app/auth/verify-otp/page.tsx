"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AuthShell } from "../components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

interface OtpAuthClient {
  emailOtp: {
    sendVerificationOtp: (options: {
      email: string;
      type: "sign-in" | "email-verification" | "forget-password";
    }) => Promise<{ data?: unknown; error?: { message?: string } }>;
    verifyEmail: (options: {
      email: string;
      otp: string;
    }) => Promise<{ data?: unknown; error?: { message?: string } }>;
  };
  signIn: {
    emailOtp: (options: {
      email: string;
      otp: string;
    }) => Promise<{ data?: unknown; error?: { message?: string } }>;
  };
}

// Inner form managing the 6-digit OTP verification flow
function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorRef = useRef<HTMLDivElement>(null);

  const initialType =
    searchParams.get("type") === "email-verification"
      ? "email-verification"
      : "sign-in";
  const initialEmail = searchParams.get("email") || "";

  const [otpType] = useState<"sign-in" | "email-verification">(initialType);
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"send" | "verify">(
    initialEmail ? "verify" : "send"
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(initialEmail ? 60 : 0);

  // Moves focus to error container when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Countdown timer for resending OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Sends or resends the OTP code to the user's email
  const handleSendOtp = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsPending(true);

    try {
      const client = authClient as unknown as OtpAuthClient;
      const result = await client.emailOtp.sendVerificationOtp({
        email: cleanEmail,
        type: otpType,
      });

      if (result?.error) {
        setError(result.error.message || "Failed to send code. Please try again.");
      } else {
        setStep("verify");
        setCountdown(60);
        setSuccessMessage(`A verification code was sent to ${cleanEmail}.`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred while sending the verification code.";
      setError(message);
    } finally {
      setIsPending(false);
    }
  };

  // Verifies the submitted OTP code
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
      const client = authClient as unknown as OtpAuthClient;
      if (otpType === "sign-in") {
        const result = await client.signIn.emailOtp({
          email: email.trim(),
          otp: cleanOtp,
        });

        if (result?.error) {
          setError(result.error.message || "Invalid or expired code. Please try again.");
          setIsPending(false);
        } else {
          document.cookie =
            "autopulse_otp_pending=; path=/; max-age=0; SameSite=Lax";
          router.push("/onboarding");
        }
      } else {
        const result = await client.emailOtp.verifyEmail({
          email: email.trim(),
          otp: cleanOtp,
        });

        if (result?.error) {
          setError(result.error.message || "Invalid or expired code. Please try again.");
          setIsPending(false);
        } else {
          document.cookie =
            "autopulse_otp_pending=; path=/; max-age=0; SameSite=Lax";
          document.cookie =
            "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";
          setSuccessMessage(
            "Email successfully verified. Redirecting to setup..."
          );
          setTimeout(() => {
            router.push("/onboarding");
          }, 800);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred while verifying the code.";
      setError(message);
      setIsPending(false);
    }
  };

  // Initial step: enter email if arriving without email query parameter
  if (step === "send") {
    return (
      <form onSubmit={handleSendOtp} className="space-y-4 text-left">
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

        <Button
          type="submit"
          disabled={isPending || !email.trim()}
          className="w-full h-12 rounded-[8px] bg-ink text-white hover:bg-neutral-800 dark:bg-white dark:text-ink dark:hover:bg-neutral-200 transition-colors font-medium text-sm"
        >
          {isPending ? "Sending code..." : "Send code"}
        </Button>
      </form>
    );
  }

  // Verification step: input the 6-digit code
  return (
    <form onSubmit={handleVerifyOtp} className="space-y-4 text-left">
      {/* Success notification */}
      {successMessage && (
        <Alert className="border-signal-line bg-signal-soft text-foreground">
          <CheckCircle2 className="size-4 text-primary shrink-0" aria-hidden="true" />
          <AlertDescription className="text-sm">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Code input field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="otp" className="text-sm font-medium text-foreground">
            Verification code
          </Label>
          <button
            type="button"
            onClick={() => handleSendOtp()}
            disabled={countdown > 0 || isPending}
            className="text-xs text-primary hover:underline font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
          className="h-12 rounded-[8px] border-border-light dark:border-border bg-white dark:bg-card text-foreground font-mono text-center tracking-widest text-lg"
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

      {/* Verification submission button */}
      <Button
        type="submit"
        disabled={isPending || otp.trim().length < 6}
        className="w-full h-12 rounded-[8px] bg-ink text-white hover:bg-neutral-800 dark:bg-white dark:text-ink dark:hover:bg-neutral-200 transition-colors font-medium text-sm"
      >
        {isPending ? "Verifying..." : "Verify code"}
      </Button>

      {/* Change email option */}
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => {
            setStep("send");
            setOtp("");
            setError(null);
            setSuccessMessage(null);
          }}
          className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
        >
          Use a different email address
        </button>
      </div>
    </form>
  );
}

// Verification page rendering the shared AuthShell split-screen layout
export default function VerifyOtpPage() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");

  const descriptionText = emailParam
    ? `We sent a code to ${emailParam}.`
    : "Enter your email to receive a verification code.";

  return (
    <AuthShell
      title="Check your email"
      description={descriptionText}
      footer={
        <p className="text-sm text-muted-foreground text-left">
          <Link
            href="/auth/sign-in"
            className="text-primary font-medium hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="w-full py-8 text-center text-sm text-muted-foreground">
            Loading verification...
          </div>
        }
      >
        <VerifyOtpForm />
      </Suspense>
    </AuthShell>
  );
}
