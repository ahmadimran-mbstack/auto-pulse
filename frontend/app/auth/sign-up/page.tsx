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
import { AuthShell } from "../components/AuthShell";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Check, Circle, Eye, EyeOff, Loader2 } from "lucide-react";

// Inner registration form with interactive password criteria and validation
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

  // Moves focus to error container when an error occurs
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  // Generates a strong random password adhering to all security criteria
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
        // Clipboard write failed
      }
    }
  };

  // Submits the new account details and triggers verification OTP dispatch
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

      // Clear any prior signed-out sentinel flag
      document.cookie = "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";

      // Neon Auth sends the single verification email on signUp.email; navigate to verify page
      router.replace("/auth/verify-otp");
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
    <div className="w-full font-normal">
      {/* Existing account conflict alert */}
      {existingAccountEmail && (
        <Alert className="mb-3 border-signal-line bg-signal-soft text-foreground text-left font-normal">
          <AlertCircle className="size-4 text-primary shrink-0" aria-hidden="true" />
          <AlertTitle className="font-normal">Account already exists</AlertTitle>
          <AlertDescription className="text-caption mt-1 font-normal">
            An account with {existingAccountEmail} is already registered. Please sign in instead.
          </AlertDescription>
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="text-xs font-normal"
            >
              <Link href={`/auth/sign-in?email=${encodeURIComponent(existingAccountEmail)}`}>
                Sign in with this email
              </Link>
            </Button>
          </div>
        </Alert>
      )}

      {/* URL parameter error */}
      {urlError && (
        <Alert variant="destructive" className="mb-3 text-left font-normal">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <AlertDescription className="text-meta font-normal">
            Authentication error ({urlError}). Please register with your email address below.
          </AlertDescription>
        </Alert>
      )}

      {/* Google Social Sign In */}
      <div className="w-full">
        <GoogleSignInButton text="Sign up with Google" />
      </div>

      {/* OR divider with 14px above and below */}
      <div className="relative my-3.5 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full bg-[var(--lp-border-hairline)]" />
        </div>
        <div className="relative bg-[var(--lp-bg)] px-3 text-xs text-[var(--lp-text-muted)] uppercase tracking-wider font-normal">
          or
        </div>
      </div>

      <form onSubmit={handleSubmit} className="text-left">
        <div className="flex flex-col gap-3">
          {/* Full Name input */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
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
              className="h-10 rounded-[8px] border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
            />
          </div>

          {/* Email input */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
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
              className="h-10 rounded-[8px] border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
            />
          </div>

          {/* Password input with generator helper and eye toggle */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
                Password
              </Label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-[13px] leading-[1.2] text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] hover:underline font-normal cursor-pointer"
              >
                Generate strong
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-[8px] border border-[var(--lp-border-input)] bg-[var(--lp-surface)] px-3.5 pr-10 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-2 focus-visible:ring-[var(--lp-ice)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none"
              />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--lp-text-muted)] hover:text-[var(--lp-text-heading)] cursor-pointer focus:outline-none transition-colors"
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
        </div>

        {/* Notice after generating and copying password */}
        {copiedNotice && (
          <p className="mt-1 text-xs leading-[1.3] text-[var(--lp-ice)] font-normal">
            Generated password copied to clipboard.
          </p>
        )}

        {/* Password security condition checklist */}
        {password.length > 0 && (
          <div className="mt-1 p-2.5 rounded-[8px] bg-[var(--lp-surface)] border border-[var(--lp-border)] space-y-1 font-normal">
            <p className="text-xs leading-[1.3] font-normal text-[var(--lp-text-muted)]">
              Password requirements:
            </p>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div className="flex items-center gap-1.5">
                {criteria.minLength ? (
                  <Check className="size-3 text-[#62c073] shrink-0" />
                ) : (
                  <Circle className="size-3 text-[var(--lp-text-muted)] shrink-0" />
                )}
                <span className={criteria.minLength ? "text-[var(--lp-text-heading)] font-normal" : "text-[var(--lp-text-muted)] font-normal"}>
                  8+ characters
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {criteria.hasUppercase ? (
                  <Check className="size-3 text-[#62c073] shrink-0" />
                ) : (
                  <Circle className="size-3 text-[var(--lp-text-muted)] shrink-0" />
                )}
                <span className={criteria.hasUppercase ? "text-[var(--lp-text-heading)] font-normal" : "text-[var(--lp-text-muted)] font-normal"}>
                  1 uppercase letter
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {criteria.hasNumber ? (
                  <Check className="size-3 text-[#62c073] shrink-0" />
                ) : (
                  <Circle className="size-3 text-[var(--lp-text-muted)] shrink-0" />
                )}
                <span className={criteria.hasNumber ? "text-[var(--lp-text-heading)] font-normal" : "text-[var(--lp-text-muted)] font-normal"}>
                  1 number
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {criteria.hasSpecial ? (
                  <Check className="size-3 text-[#62c073] shrink-0" />
                ) : (
                  <Circle className="size-3 text-[var(--lp-text-muted)] shrink-0" />
                )}
                <span className={criteria.hasSpecial ? "text-[var(--lp-text-heading)] font-normal" : "text-[var(--lp-text-muted)] font-normal"}>
                  1 special symbol
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error notification display: 12px above, 8px 12px padding */}
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

        {/* Primary submission button: 16px below last field */}
        <Button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 w-full h-10 rounded-[8px] bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] transition-colors !font-normal text-sm flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
              <span>Creating account...</span>
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </div>
  );
}

// Sign-up page rendering the shared AuthShell split-screen layout
export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your AutoPulse account"
      description="Setup takes a few minutes. You approve every post before it goes live."
      agreementType="sign-up"
      footer={
        <p className="text-sm text-muted-foreground text-left font-normal">
          Already have an account?{" "}
          <Link
            href="/auth/sign-in"
            className="text-foreground hover:underline font-normal"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="w-full py-8 text-center text-sm text-muted-foreground font-normal">
            Loading sign up form...
          </div>
        }
      >
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}