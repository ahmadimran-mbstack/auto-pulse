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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AuthStatusLegend } from "../components/AuthStatusLegend";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Activity, AlertCircle, Check, Circle } from "lucide-react";

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

  // Move focus to error container when an error occurs for accessibility
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
    <Card className="w-full max-w-[400px] p-6 sm:p-8 bg-card border-border text-left mx-auto lg:mx-0">
      <h1 className="text-title font-display text-foreground mb-2">
        Create your account
      </h1>
      <p className="text-body text-muted-foreground mb-6">
        Start generating and reviewing daily LinkedIn content.
      </p>

      {/* Warning when account with email already exists */}
      {existingAccountEmail && (
        <Alert className="mb-5 border-primary bg-signal-soft">
          <AlertCircle className="size-4 text-primary shrink-0" aria-hidden="true" />
          <AlertTitle className="text-meta font-semibold text-primary">
            Account already exists
          </AlertTitle>
          <AlertDescription className="text-caption text-foreground space-y-3">
            <p>
              An account is already registered with <strong>{existingAccountEmail}</strong>. Please sign in to access your workspace.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button size="sm" asChild>
                <Link href={`/auth/sign-in?email=${encodeURIComponent(existingAccountEmail)}`}>
                  Sign in to your account
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setExistingAccountEmail(null);
                  setEmail("");
                }}
              >
                Use another email
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Account exists warning if user tried OAuth with existing email */}
      {urlError === "account_not_linked" ? (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle>Account already exists</AlertTitle>
          <AlertDescription className="text-caption leading-relaxed">
            An account with this email already exists. Please{" "}
            <Link href="/auth/sign-in" className="text-primary underline font-medium">
              sign in with your password
            </Link>{" "}
            instead.
          </AlertDescription>
        </Alert>
      ) : urlError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <AlertDescription className="text-meta">
            Authentication error ({urlError}). Please continue with email and password below.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Google Social Sign In */}
      <div className="mb-5">
        <GoogleSignInButton text="Sign up with Google" />
      </div>

      {/* Visual separator */}
      <div className="flex items-center gap-3 mb-5">
        <Separator className="flex-1" />
        <span className="text-caption text-muted-foreground">or continue with email</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Full name
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">
            Email address
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">
              Password
            </Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-caption text-primary hover:underline font-medium cursor-pointer"
              >
                Generate secure
              </button>
              <span className="text-caption text-border" aria-hidden="true">|</span>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-caption text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="font-mono text-meta"
          />

          {copiedNotice && (
            <p className="mt-1 text-caption text-primary font-medium">
              Generated password copied to clipboard.
            </p>
          )}

          {/* Password complexity checklist */}
          <div className="mt-3 p-3 rounded-md bg-secondary/50 border border-border space-y-2">
            <p className="text-caption font-medium text-muted-foreground">
              Password requirements
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-caption">
              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.minLength ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {criteria.minLength ? (
                  <Check className="size-3.5 text-primary shrink-0" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
                )}
                <span>At least 8 characters</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.hasUppercase ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {criteria.hasUppercase ? (
                  <Check className="size-3.5 text-primary shrink-0" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
                )}
                <span>One uppercase letter</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.hasNumber ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {criteria.hasNumber ? (
                  <Check className="size-3.5 text-primary shrink-0" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
                )}
                <span>One number (0-9)</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  criteria.hasSpecial ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {criteria.hasSpecial ? (
                  <Check className="size-3.5 text-primary shrink-0" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden="true" />
                )}
                <span>One special symbol</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error display with programmatic focus */}
        {error && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="p-3 rounded-md bg-status-danger-bg text-status-danger-fg text-body border border-destructive/20 outline-none"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={!canSubmit}
          className="w-full mt-2"
        >
          {isPending ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <div className="mt-6 pt-5 border-t border-border text-meta text-muted-foreground text-left">
        <span>Already have an account? </span>
        <Link
          href="/auth/sign-in"
          className="text-primary font-medium hover:underline"
        >
          Sign in
        </Link>
      </div>
    </Card>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Minimal Top Header */}
      <header className="px-6 py-6 page-container w-full mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="size-7 rounded-md bg-card border border-border flex items-center justify-center text-primary group-hover:border-primary/40 transition-colors">
            <Activity className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <span className="font-display font-semibold text-lg text-foreground">
            AutoPulse
          </span>
        </Link>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 page-container w-full mx-auto px-6 py-8 md:py-12 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column: Sign-up form (max 400px) */}
          <Suspense
            fallback={
              <Card className="w-full max-w-[400px] p-6 sm:p-8 bg-card border-border text-left mx-auto lg:mx-0">
                <p className="text-body text-muted-foreground">Loading sign up form...</p>
              </Card>
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
