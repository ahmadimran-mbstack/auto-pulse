"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { AuthShell } from "../components/AuthShell";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

interface OtpClient {
  emailOtp: {
    sendVerificationOtp: (options: {
      email: string;
      type: "sign-in" | "email-verification" | "forget-password";
    }) => Promise<{ data?: unknown; error?: { message?: string } }>;
  };
}

// Inner form handling user authentication inputs and submissions
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

  // Moves focus to the error banner for accessibility when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Authenticates the user with email and password, then proceeds to OTP verification
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
      // 1. Authenticate user credentials with Neon Auth
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

      // Clear any prior signed-out sentinel flag upon authenticating
      document.cookie = "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";

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
    <div className="w-full space-y-4 font-normal">
      {/* Account linking error notification */}
      {urlError === "account_not_linked" ? (
        <Alert variant="destructive" className="mb-4 font-normal">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <AlertTitle className="font-normal">Account already exists</AlertTitle>
          <AlertDescription className="text-caption leading-relaxed font-normal">
            An account with this email was previously registered using email and password. Please sign in with your password below. Once signed in, you can link your Google account in Settings.
          </AlertDescription>
        </Alert>
      ) : urlError === "access_denied" ? (
        <Alert variant="destructive" className="mb-4 font-normal">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <AlertDescription className="text-meta font-normal">
            Google sign in was cancelled or access was denied. Please try again.
          </AlertDescription>
        </Alert>
      ) : urlError ? (
        <Alert variant="destructive" className="mb-4 font-normal">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <AlertDescription className="text-meta font-normal">
            Authentication error ({urlError}). Please sign in with your email and password.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Password reset success notification */}
      {urlMessage === "password_reset_success" && (
        <Alert className="mb-4 border-signal-line bg-signal-soft text-foreground font-normal">
          <CheckCircle2 className="size-4 text-primary shrink-0" aria-hidden="true" />
          <AlertDescription className="text-meta font-normal">
            Your password has been successfully reset. Please sign in with your new password.
          </AlertDescription>
        </Alert>
      )}

      {/* Google Social Sign In */}
      <div className="w-full">
        <GoogleSignInButton text="Continue with Google" />
      </div>

      {/* Visual divider using shadcn Separator */}
      <div className="relative py-2 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full bg-neutral-200 dark:bg-border" />
        </div>
        <div className="relative bg-white dark:bg-background px-3 text-xs text-muted-foreground uppercase tracking-wider font-normal">
          or
        </div>
      </div>

      {/* Email and Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email field */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="email" className="text-sm font-normal text-foreground">
            Email
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
            className="h-11 rounded-lg border border-neutral-200 dark:border-border bg-white dark:bg-card px-3.5 text-sm text-foreground font-normal placeholder:text-muted-foreground focus-visible:border-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-900/20 outline-none"
          />
        </div>

        {/* Password field with eye toggle and forgot password link */}
        <div className="space-y-1.5 text-left">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-normal text-foreground">
              Password
            </Label>
            <Link
              href="/auth/forgot-password"
              className="text-sm text-neutral-600 dark:text-muted-foreground hover:text-foreground hover:underline font-normal"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg border border-neutral-200 dark:border-border bg-white dark:bg-card px-3.5 pr-10 text-sm text-foreground font-normal placeholder:text-muted-foreground focus-visible:border-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-900/20 outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Eye className="size-4 shrink-0" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Inline error notice */}
        {error && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="p-3 rounded-lg bg-status-danger-bg text-status-danger-fg text-sm border border-destructive/20 outline-none text-left font-normal"
          >
            {error}
          </div>
        )}

        {/* Primary submit button */}
        <Button
          type="submit"
          disabled={isPending || !email.trim() || !password}
          className="w-full h-11 rounded-lg bg-neutral-950 text-white hover:bg-neutral-900 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 transition-colors font-normal text-sm flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
              <span>Signing in...</span>
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </div>
  );
}

// Sign-in page rendering the shared AuthShell split-screen layout
export default function SignInPage() {
  return (
    <AuthShell
      title="Sign in to AutoPulse"
      description="Welcome back. Sign in to manage your LinkedIn posts."
      agreementType="sign-in"
      footer={
        <p className="text-sm text-muted-foreground text-left font-normal">
          New here?{" "}
          <Link
            href="/auth/sign-up"
            className="text-foreground hover:underline font-normal"
          >
            Create your account
          </Link>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="w-full py-8 text-center text-sm text-muted-foreground font-normal">
            Loading sign in form...
          </div>
        }
      >
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}