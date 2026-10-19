"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AuthStatusLegend } from "../components/AuthStatusLegend";

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
    <div className="w-full max-w-[400px] text-left">
      <h1 className="text-3xl font-geist font-normal tracking-tighter mb-2">
        {step === "send"
          ? otpType === "sign-in"
            ? "Sign in with one-time code"
            : "Verify your email"
          : "Enter verification code"}
      </h1>
      <p className="text-sm text-muted mb-6">
        {step === "send"
          ? "We will send a 6-digit passcode to your email inbox."
          : `Enter the 6-digit code sent to ${email || "your email"}.`}
      </p>

      {/* Mode Selector only shown when manually sending */}
      {step === "send" && (
        <div className="flex border border-line rounded-[8px] p-1 bg-paper mb-5">
          <button
            type="button"
            onClick={() => setOtpType("sign-in")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-colors cursor-pointer ${
              otpType === "sign-in"
                ? "bg-surface text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setOtpType("email-verification")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[6px] transition-colors cursor-pointer ${
              otpType === "email-verification"
                ? "bg-surface text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            Verify email
          </button>
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div className="p-3.5 mb-5 rounded-[8px] bg-signal-soft border border-[#93D7CE] text-sm text-ink leading-relaxed">
          {successMessage}
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-3.5 mb-5 rounded-[8px] bg-rejected-bg text-rejected-text text-sm leading-relaxed border border-rose-200">
          {error}
        </div>
      )}

      {step === "send" ? (
        <form onSubmit={handleSendOtp} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || !email.trim()}
            className="w-full py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover disabled:opacity-60 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs active:translate-y-[1px]"
          >
            {isPending ? "Sending code..." : "Send verification code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="otp"
                className="block text-sm font-medium text-ink"
              >
                6-digit code
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep("send");
                  setOtp("");
                }}
                className="text-xs text-signal hover:underline cursor-pointer"
              >
                Change email
              </button>
            </div>
            <input
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
              className="w-full px-3.5 py-3 rounded-[8px] border border-line bg-surface text-ink text-center text-xl font-mono tracking-widest placeholder:tracking-normal placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
            />
          </div>

          <button
            type="submit"
            disabled={isPending || otp.length < 6}
            className="w-full py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover disabled:opacity-60 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs active:translate-y-[1px]"
          >
            {isPending
              ? "Verifying code..."
              : otpType === "sign-in"
              ? "Verify and sign in"
              : "Verify email"}
          </button>

          <div className="pt-2 flex items-center justify-between text-xs text-muted">
            <span>Did not receive code?</span>
            {countdown > 0 ? (
              <span>Resend in {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={isPending}
                className="text-signal font-medium hover:underline cursor-pointer disabled:opacity-50"
              >
                Resend code
              </button>
            )}
          </div>
        </form>
      )}

      <div className="mt-8 pt-6 border-t border-line text-sm text-muted space-y-2">
        <div>
          <span>Prefer standard password login? </span>
          <Link
            href="/auth/sign-in"
            className="text-signal font-medium hover:underline"
          >
            Sign in with password
          </Link>
        </div>
        <div>
          <span>New to AutoPulse? </span>
          <Link
            href="/auth/sign-up"
            className="text-signal font-medium hover:underline"
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
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      {/* Minimal Top Header */}
      <header className="px-6 py-6 max-w-[1160px] w-full mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-[6px] bg-surface border border-line flex items-center justify-center text-signal group-hover:border-signal/40 transition-colors">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h5l3-7 4 14 3-7h3" />
            </svg>
          </div>
          <span className="font-geist font-normal tracking-tighter text-xl text-ink">
            AutoPulse
          </span>
        </Link>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column wrapped in Suspense for useSearchParams */}
          <Suspense
            fallback={
              <div className="w-full max-w-[400px] text-left text-sm text-muted">
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
