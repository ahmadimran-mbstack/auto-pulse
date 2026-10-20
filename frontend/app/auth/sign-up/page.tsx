"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import {
  checkPasswordCriteria,
  isPasswordValid,
  generateSecurePassword,
} from "@/lib/auth/password";
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

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [existingAccountEmail, setExistingAccountEmail] = useState<string | null>(null);

  const urlError = searchParams.get("error");
  const criteria = checkPasswordCriteria(password);
  const passwordIsValid = isPasswordValid(password);
  const canSubmit = !isPending && name.trim() && email.trim() && passwordIsValid;

  // Move focus to error container when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Generate strong compliant password and populate input
  const handleGeneratePassword = async () => {
    const generated = generateSecurePassword(16);
    setPassword(generated);
    setShowPassword(true);
    setError(null);

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(generated);
        setCopiedNotice(true);
        setTimeout(() => setCopiedNotice(false), 2500);
      } catch {
        // Clipboard access failed silently
      }
    }
  };

  // Submit sign up and automatically transition to OTP verification
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setExistingAccountEmail(null);

    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (!cleanName || !cleanEmail) {
      setError("Please fill in your name and email address.");
      return;
    }

    if (!isPasswordValid(password)) {
      setError("Please ensure your password fulfills all required security conditions.");
      return;
    }

    setIsPending(true);

    try {
      // 1. Create account in Neon Auth
      const result = await authClient.signUp.email({
        email: cleanEmail,
        name: cleanName,
        password,
      });

      if (result.error) {
        const errorMsg = result.error.message || "";
        const isUserExists =
          result.error.code === "USER_ALREADY_EXISTS" ||
          result.error.code === "USER_EXISTS" ||
          errorMsg.toLowerCase().includes("already exists") ||
          errorMsg.toLowerCase().includes("user already") ||
          errorMsg.toLowerCase().includes("already registered");

        if (isUserExists) {
          setExistingAccountEmail(cleanEmail);
          setError(null);
          setIsPending(false);
          return;
        }

        setError(result.error.message || "Failed to create account. Please try again.");
        setIsPending(false);
        return;
      }

      // 2. Mark OTP as pending in cookie
      document.cookie = "autopulse_otp_pending=true; path=/; max-age=600; SameSite=Lax";

      // 3. Send email verification OTP
      try {
        const client = authClient as unknown as OtpClient;
        await client.emailOtp.sendVerificationOtp({
          email: cleanEmail,
          type: "email-verification",
        });
      } catch (otpErr) {
        console.error("Failed to trigger verification OTP:", otpErr);
      }

      // 4. Automatically navigate to OTP verification screen
      router.push(
        `/auth/verify-otp?email=${encodeURIComponent(cleanEmail)}&type=email-verification`
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign up. Please try again.";
      setError(message);
      setIsPending(false);
    }
  };

  return (
    <div className="w-full max-w-[420px] text-left">
      <h1 className="text-3xl font-geist font-normal tracking-tighter text-ink mb-2">
        Create your account
      </h1>
      <p className="text-sm text-muted mb-6">
        Start generating and reviewing daily LinkedIn content.
      </p>

      {/* Prominent warning when account with email already exists */}
      {existingAccountEmail && (
        <div
          role="alert"
          className="mb-5 p-4 rounded-[10px] border border-signal bg-signal-soft text-ink text-sm leading-relaxed space-y-2.5 shadow-xs"
        >
          <div className="flex items-center gap-2 font-medium text-signal">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-semibold">Account already exists</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            An account is already registered with <strong className="text-ink">{existingAccountEmail}</strong>. Please sign in to access your workspace.
          </p>
          <div className="pt-1 flex flex-col sm:flex-row gap-2">
            <Link
              href={`/auth/sign-in?email=${encodeURIComponent(existingAccountEmail)}`}
              className="px-4 py-2 rounded-[8px] bg-signal text-surface text-xs font-medium hover:bg-signal-hover transition-colors text-center shadow-xs"
            >
              Sign in to your account
            </Link>
            <button
              type="button"
              onClick={() => {
                setExistingAccountEmail(null);
                setEmail("");
              }}
              className="px-3 py-2 rounded-[8px] border border-line bg-surface text-ink text-xs font-medium hover:bg-paper transition-colors text-center cursor-pointer"
            >
              Use another email
            </button>
          </div>
        </div>
      )}

      {/* Account exists warning if user tried OAuth with existing email */}
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
            An account with this email already exists. Please{" "}
            <Link href="/auth/sign-in" className="text-signal underline font-medium">
              sign in with your password
            </Link>{" "}
            instead.
          </p>
        </div>
      ) : urlError ? (
        <div
          role="alert"
          className="mb-5 p-3.5 rounded-[10px] bg-rejected-bg text-rejected-text text-sm leading-relaxed border border-rose-200"
        >
          Authentication error ({urlError}). Please continue with email and password below.
        </div>
      ) : null}

      {/* Google Social Sign In */}
      <div className="mb-5">
        <GoogleSignInButton text="Sign up with Google" />
      </div>

      {/* Visual separator */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-line" />
        <span className="text-xs text-muted">or continue with email</span>
        <div className="flex-1 h-px bg-line" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-ink mb-1.5"
          >
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden"
          />
        </div>

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-xs text-signal hover:underline font-medium cursor-pointer"
              >
                Generate secure password
              </button>
              <span className="text-xs text-line">|</span>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-xs text-muted hover:text-ink cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-[8px] border border-line bg-surface text-ink text-sm placeholder:text-muted/60 focus:border-signal focus:ring-2 focus:ring-signal/15 transition-all outline-hidden font-mono text-[13px]"
          />

          {copiedNotice && (
            <p className="mt-1 text-xs text-signal font-medium">
              Generated password copied to clipboard!
            </p>
          )}

          {/* Password complexity requirements checklist */}
          <div className="mt-3 p-3 rounded-[8px] bg-paper border border-line space-y-1.5">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2 font-mono">
              Password Requirements
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.minLength ? "text-signal font-medium" : "text-muted"
                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 shrink-0 ${
                    criteria.minLength ? "text-signal" : "text-muted/40"
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>At least 8 characters</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.hasUppercase ? "text-signal font-medium" : "text-muted"
                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 shrink-0 ${
                    criteria.hasUppercase ? "text-signal" : "text-muted/40"
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>One uppercase letter</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.hasNumber ? "text-signal font-medium" : "text-muted"
                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 shrink-0 ${
                    criteria.hasNumber ? "text-signal" : "text-muted/40"
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>One number (0-9)</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.hasSpecial ? "text-signal font-medium" : "text-muted"
                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 shrink-0 ${
                    criteria.hasSpecial ? "text-signal" : "text-muted/40"
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>One special symbol</span>
              </div>
            </div>
          </div>
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
          disabled={!canSubmit}
          className="w-full mt-2 py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs active:translate-y-[1px]"
        >
          {isPending ? "Creating account and sending code..." : "Create Account"}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-line text-sm text-muted">
        <span>Already have an account? </span>
        <Link
          href="/auth/sign-in"
          className="text-signal font-medium hover:underline"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

export default function SignUpPage() {
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
          {/* Left Column: Sign-up form wrapped in Suspense for useSearchParams */}
          <Suspense
            fallback={
              <div className="w-full max-w-[420px] text-left text-sm text-muted">
                Loading sign up form...
              </div>
            }
          >
            <SignUpForm />
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
