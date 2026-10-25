"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AuthStatusLegend } from "../components/AuthStatusLegend";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";

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

  const [email, setEmail] = useState(searchParams.get("email") || "");
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
    <div className="w-full max-w-sm text-left">
      <h1 className="text-title font-display text-foreground mb-2">
        Sign in
      </h1>
      <p className="text-body text-muted-foreground mb-6">
        Access your AutoPulse drafts and review queue.
      </p>

      {/* Account linking error notification */}
      {urlError === "account_not_linked" ? (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="size-4 shrink-0" />
          <AlertTitle>Account already exists</AlertTitle>
          <AlertDescription className="text-caption leading-relaxed">
            An account with this email was previously registered using email and password. Please sign in with your password below. Once signed in, you can link your Google account in Settings.
          </AlertDescription>
        </Alert>
      ) : urlError === "access_denied" ? (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-meta">
            Google sign in was cancelled or access was denied. Please try again.
          </AlertDescription>
        </Alert>
      ) : urlError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-meta">
            Authentication error ({urlError}). Please sign in with your email and password.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Password reset success notification */}
      {urlMessage === "password_reset_success" && (
        <Alert className="mb-5 border-signal-line bg-signal-soft text-foreground">
          <CheckCircle2 className="size-4 text-primary shrink-0" />
          <AlertDescription className="text-meta">
            Your password has been successfully reset. Please sign in with your new password.
          </AlertDescription>
        </Alert>
      )}

      {/* Google Social Sign In */}
      <div className="mb-5">
        <GoogleSignInButton text="Sign in with Google" />
      </div>

      {/* Visual separator */}
      <div className="flex items-center gap-3 mb-5">
        <Separator className="flex-1" />
        <span className="text-caption text-muted-foreground">or continue with email</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-caption text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
              <Link
                href="/auth/forgot-password"
                className="text-caption text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* Error display */}
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
          disabled={isPending || !email.trim() || !password}
          className="w-full"
        >
          {isPending ? "Checking credentials and sending code..." : "Sign In"}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border text-body text-muted-foreground">
        <span>New here? </span>
        <Link
          href="/auth/sign-up"
          className="text-primary font-medium hover:underline"
        >
          Create your account
        </Link>
      </div>
    </div>
  );
}

export default function SignInPage() {
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
          {/* Left Column: Sign-in form wrapped in Suspense for useSearchParams */}
          <Suspense
            fallback={
              <div className="w-full max-w-sm text-left text-body text-muted-foreground">
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
