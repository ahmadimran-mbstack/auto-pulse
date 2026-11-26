"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authToast } from "@/lib/auth-toast";
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
import { Check, Circle, Eye, EyeOff, Loader2 } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Inner registration form with interactive password criteria and validation
function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  const urlError = searchParams.get("error");
  const criteria = checkPasswordCriteria(password);

  // Shows URL-based OAuth errors as a toast on mount
  useEffect(() => {
    if (urlError) {
      authToast.error(
        `Authentication error (${urlError}). Please register with your email address below.`,
        { id: "sign-up-url-error" }
      );
    }
  }, [urlError]);

  // Generates a strong random password and shows a copy confirmation toast
  const handleGeneratePassword = async () => {
    const generated = generateSecurePassword(16);
    setPassword(generated);
    setShowPassword(true);
    setFieldErrors((prev) => ({ ...prev, password: undefined }));

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(generated);
        authToast.success("Generated password copied to clipboard.", {
          id: "sign-up-password-copied",
        });
      } catch {
        // Clipboard write failed
      }
    }
  };

  // Validates name, email, and password fields inline before submitting
  const validateFields = (
    cleanName: string,
    cleanEmail: string,
    rawPassword: string
  ) => {
    const nextErrors: { name?: string; email?: string; password?: string } = {};
    if (!cleanName) {
      nextErrors.name = "Please enter your full name.";
    }
    if (!cleanEmail) {
      nextErrors.email = "Please enter your email address.";
    } else if (!EMAIL_PATTERN.test(cleanEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!isPasswordValid(rawPassword)) {
      nextErrors.password =
        "Please ensure your password fulfills all required security conditions.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Submits the new account details and triggers verification OTP dispatch
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    authToast.dismiss();

    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (!validateFields(cleanName, cleanEmail, password)) {
      return;
    }

    setIsPending(true);

    try {
      // Create account in Neon Auth
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

        // Show neutral existing-account toast with a Sign in action button
        if (isUserExists) {
          authToast.info("Account already exists", {
            id: "sign-up-account-exists",
            description: `An account with ${cleanEmail} is already registered. Please sign in instead.`,
            action: {
              label: "Sign in",
              onClick: () =>
                router.push(`/auth/sign-in?email=${encodeURIComponent(cleanEmail)}`),
            },
          });
          setIsPending(false);
          return;
        }

        // Show rate limit wait time when sign-up is throttled
        const status = (result.error as { status?: number }).status;
        if (status === 429 || result.error.code === "TOO_MANY_REQUESTS") {
          authToast.warning("Too many attempts", {
            id: "sign-up-rate-limit",
            description: "Please wait 60 seconds before trying again.",
          });
          setIsPending(false);
          return;
        }

        authToast.error(
          result.error.message || "Failed to create account. Please try again.",
          { id: "sign-up-error" }
        );
        setIsPending(false);
        return;
      }

      // Clear any prior signed-out sentinel flag
      document.cookie = "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";

      const returnTo = searchParams.get("returnTo");
      const safeReturn = returnTo && returnTo.startsWith("/app/") ? returnTo : null;
      const target = safeReturn
        ? `/auth/verify-otp?returnTo=${encodeURIComponent(safeReturn)}`
        : "/auth/verify-otp";
      // Neon Auth sends the single verification email on signUp.email; navigate to verify page
      router.refresh();
      router.replace(target);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign up. Please try again.";
      authToast.error(message, { id: "sign-up-error" });
      setIsPending(false);
    }
  };

  return (
    <div className="w-full font-normal">
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

      <form noValidate onSubmit={handleSubmit} className="text-left">
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
              autoComplete="name"
              placeholder="Jane Doe"
              value={name}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) {
                  setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${fieldErrors.name
                ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
                }`}
            />
            {/* Inline field error for full name */}
            {fieldErrors.name && (
              <p id="name-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
                {fieldErrors.name}
              </p>
            )}
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
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) {
                  setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${fieldErrors.email
                ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
                }`}
            />
            {/* Inline field error for email */}
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
                {fieldErrors.email}
              </p>
            )}
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
                autoComplete="new-password"
                placeholder="Create a strong password"
                value={password}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                className={`h-10 rounded-[8px] border bg-[var(--lp-surface)] px-3.5 pr-10 text-sm text-[var(--lp-text-heading)] font-normal placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)] outline-none ${fieldErrors.password
                  ? "border-[#ff6369] focus-visible:border-[#ff6369] focus-visible:ring-[#ff6369]/60"
                  : "border-[var(--lp-border-input)] focus-visible:border-[var(--lp-ice)] focus-visible:ring-[var(--lp-ice)]/60"
                  }`}
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
            {/* Inline field error for password */}
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
                {fieldErrors.password}
              </p>
            )}
          </div>
        </div>

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

        {/* Primary submission button: 16px below last field */}
        <Button
          type="submit"
          disabled={isPending}
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
