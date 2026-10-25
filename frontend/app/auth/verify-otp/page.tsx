"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthStatusLegend } from "../components/AuthStatusLegend";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";

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

function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode can be 'sign-in' or 'email-verification'
  const initialType =
    searchParams.get("type") === "email-verification"
      ? "email-verification"
      : "sign-in";
  const initialEmail = searchParams.get("email") || "";

  const [otpType, setOtpType] = useState<"sign-in" | "email-verification">(initialType);
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  // If email was passed in URL from sign up or sign in, start directly on verify step
  const [step, setStep] = useState<"send" | "verify">(
    initialEmail ? "verify" : "send"
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    initialEmail
      ? `A verification code was sent to ${initialEmail}. Please enter it below.`
      : null
  );
  const [countdown, setCountdown] = useState(initialEmail ? 60 : 0);

  // Countdown timer for resending OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Request a one-time passcode to the provided email address
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
        setSuccessMessage(`A verification code has been sent to ${cleanEmail}.`);
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

  // Verify the submitted OTP code
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
        // Sign in with the received OTP
        const result = await client.signIn.emailOtp({
          email: email.trim(),
          otp: cleanOtp,
        });

        if (result?.error) {
          setError(result.error.message || "Invalid or expired code. Please try again.");
          setIsPending(false);
        } else {
          // Clear pending OTP lock cookie
          document.cookie =
            "autopulse_otp_pending=; path=/; max-age=0; SameSite=Lax";
          router.push("/app");
        }
      } else {
        // Verify email address with the OTP
        const result = await client.emailOtp.verifyEmail({
          email: email.trim(),
          otp: cleanOtp,
        });

        if (result?.error) {
          setError(result.error.message || "Invalid or expired code. Please try again.");
          setIsPending(false);
        } else {
          // Clear pending OTP lock cookie
          document.cookie =
            "autopulse_otp_pending=; path=/; max-age=0; SameSite=Lax";
          setSuccessMessage(
            "Email successfully verified! Redirecting to your dashboard..."
          );
          setTimeout(() => {
            router.push("/app");
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

  return (
    <div className="w-full max-w-sm text-left">
      <h1 className="text-title font-display text-foreground mb-2">
        {step === "send"
          ? otpType === "sign-in"
            ? "Sign in with one-time code"
            : "Verify your email"
          : "Enter verification code"}
      </h1>
      <p className="text-body text-muted-foreground mb-6">
        {step === "send"
          ? "We will send a 6-digit passcode to your email inbox."
          : `Enter the 6-digit code sent to ${email || "your email"}.`}
      </p>

      {/* Mode Selector only shown when manually sending */}
      {step === "send" && (
        <div className="flex border border-border rounded-md p-1 bg-secondary/50 mb-5">
          <Button
            type="button"
            variant={otpType === "sign-in" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setOtpType("sign-in")}
            className="flex-1 font-medium"
          >
            Sign in
          </Button>
          <Button
            type="button"
            variant={otpType === "email-verification" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setOtpType("email-verification")}
            className="flex-1 font-medium"
          >
            Verify email
          </Button>
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <Alert className="mb-5 border-signal-line bg-signal-soft">
          <CheckCircle2 className="size-4 text-primary shrink-0" />
          <AlertDescription className="text-meta text-foreground">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Notification */}
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-meta">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {step === "send" ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">
              Email address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || !email.trim()}
            className="w-full"
          >
            {isPending ? "Sending code..." : "Send verification code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="otp">
                6-digit code
              </Label>
              <button
                type="button"
                onClick={() => {
                  setStep("send");
                  setOtp("");
                }}
                className="text-caption text-primary hover:underline cursor-pointer"
              >
                Change email
              </button>
            </div>
            <Input
              id="otp"
              name="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              placeholder="123456"
              className="text-center text-lead font-mono tracking-widest tabular-nums"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || otp.length < 6}
            className="w-full"
          >
            {isPending
              ? "Verifying code..."
              : otpType === "sign-in"
              ? "Verify and sign in"
              : "Verify email"}
          </Button>

          <div className="pt-2 flex items-center justify-between text-caption text-muted-foreground">
            <span>Did not receive code?</span>
            {countdown > 0 ? (
              <span className="tabular-nums">Resend in {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={isPending}
                className="text-primary font-medium hover:underline cursor-pointer disabled:opacity-50"
              >
                Resend code
              </button>
            )}
          </div>
        </form>
      )}

      <div className="mt-8 pt-6 border-t border-border text-body text-muted-foreground space-y-2">
        <div>
          <span>Prefer standard password login? </span>
          <Link
            href="/auth/sign-in"
            className="text-primary font-medium hover:underline"
          >
            Sign in with password
          </Link>
        </div>
        <div>
          <span>New to AutoPulse? </span>
          <Link
            href="/auth/sign-up"
            className="text-primary font-medium hover:underline"
          >
            Create your account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Minimal Top Header */}
      <header className="px-6 py-6 page-container w-full mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="size-7 rounded-md bg-card border border-border flex items-center justify-center text-primary group-hover:border-primary/40 transition-colors">
            <Activity className="size-4" strokeWidth={2} />
          </div>
          <span className="font-display font-semibold text-h3 text-foreground">
            AutoPulse
          </span>
        </Link>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 page-container w-full mx-auto px-6 py-10 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column wrapped in Suspense for useSearchParams */}
          <Suspense
            fallback={
              <div className="w-full max-w-sm text-left text-body text-muted-foreground">
                Loading verification form...
              </div>
            }
          >
            <VerifyOtpForm />
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
