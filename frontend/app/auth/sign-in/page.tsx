"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AuthStatusLegend } from "../components/AuthStatusLegend";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

interface OtpClient {
  emailOtp: {
    sendVerificationOtp: (options: {
      email: string;
      type: "sign-in" | "email-verification" | "forget-password";
    }) => Promise<{ data?: unknown; error?: { message?: string } }>;
  };
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlError = searchParams.get("error");
  const urlMessage = searchParams.get("message");

  // Move focus to error container when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setIsPending(true);

    try {
      // 1. Authenticate user credentials
      const result = await authClient.signIn.email({
        email: cleanEmail,
        password,
      });

      if (result.error) {
        setError(
          result.error.message || "Failed to sign in. Please verify your email and password."
        );
        setIsPending(false);
        return;
      }

      // 2. Mark OTP verification as required before dashboard access
      document.cookie = "autopulse_otp_pending=true; path=/; max-age=600; SameSite=Lax";

      // 3. Dispatch sign-in verification OTP
      try {
        const client = authClient as unknown as OtpClient;
        await client.emailOtp.sendVerificationOtp({
          email: cleanEmail,
          type: "sign-in",
        });
      } catch (otpErr) {
        console.error("Failed to trigger sign-in OTP:", otpErr);
      }

      // 4. Automatically navigate to OTP verification screen
      router.push(
        `/auth/verify-otp?email=${encodeURIComponent(cleanEmail)}&type=sign-in`
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign in. Please try again.";
      setError(message);
      setIsPending(false);
    }
  };

  return (
    <div className="w-full max-w-[400px] text-left">
      <h1 className="text-3xl font-geist font-normal tracking-tighter text-ink mb-2">
        Sign in
      </h1>
      <p className="text-sm text-muted mb-6">
        Access your AutoPulse drafts and review queue.
      </p>

      {/* Account linking error notification */}
      {urlError === "account_not_linked" ? (
        <div
          role="alert"
          className="mb-5 p-4 rounded-[10px] border border-amber-500/30 bg-amber-500/10 text-ink text-sm leading-relaxed"
        >
          <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300 mb-1">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>Account already exists</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            An account with this email was previously registered using email and password. Please sign in with your password below. Once signed in, you can link your Google account in Settings.
          </p>
        </div>
      ) : urlError === "access_denied" ? (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-[10px] bg-rejected-bg text-rejected-text text-sm leading-relaxed border border-rose-200"
        >
          Google sign in was cancelled or access was denied. Please try again.
        </div>
      ) : urlError ? (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-[10px] bg-rejected-bg text-rejected-text text-sm leading-relaxed border border-rose-200"
        >
          Authentication error ({urlError}). Please sign in with your email and password.
        </div>
      ) : null}

      {/* Password reset success notification */}
      {urlMessage === "password_reset_success" && (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-[10px] bg-signal-soft border border-[#93D7CE] text-sm text-ink leading-relaxed"
        >
          Your password has been successfully reset. Please sign in with your new password.
        </div>
      )}

      {/* Google Social Sign In */}
      <div className="mb-5">
        <GoogleSignInButton text="Sign in with Google" />
      </div>

      {/* Visual separator */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-line" />
        <span className="text-xs text-muted">or continue with email</span>
        <div className="flex-1 h-px bg-line" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-ink"
            >
              Password
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-xs text-muted hover:text-ink cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-signal hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
          />
        </div>

        {/* Error display */}
        {error && (
          <div
            ref={errorRef}
            tabIndex={-1}
            className="p-3.5 rounded-[8px] bg-rejected-bg text-rejected-text text-sm leading-relaxed border border-rose-200 outline-hidden"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !email.trim() || !password}
          className="w-full py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover disabled:opacity-60 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs active:translate-y-[1px]"
        >
          {isPending ? "Checking credentials and sending code..." : "Sign In"}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-line text-sm text-muted">
        <span>New here? </span>
        <Link
          href="/auth/sign-up"
          className="text-signal font-medium hover:underline"
        >
          Create your account
        </Link>
      </div>
    </div>
  );
}

export default function SignInPage() {
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
          {/* Left Column: Sign-in form wrapped in Suspense for useSearchParams */}
          <Suspense
            fallback={
              <div className="w-full max-w-[400px] text-left text-sm text-muted">
                Loading sign in form...
              </div>
            }
          >
            <SignInForm />
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
