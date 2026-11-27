"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { authToast } from "@/lib/auth-toast";
import {
  fetchMeWithSessionToken,
  getPostAuthRoute,
  performSuspendedSignOut,
} from "@/lib/auth/post-auth";
import { queryClient, queryKeys } from "@/lib/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Inner form handling user authentication inputs and submissions
function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  const urlError = searchParams.get("error");
  const urlMessage = searchParams.get("message");
  const isSuspendedUrl =
    urlError === "suspended" || urlError === "ACCOUNT_SUSPENDED";

  const [suspendedAlert, setSuspendedAlert] = useState(isSuspendedUrl);
  const [checkingSession, setCheckingSession] = useState(!isSuspendedUrl);

  // Check for existing session / OAuth callback on mount unless ?error=suspended
  useEffect(() => {
    if (isSuspendedUrl) {
      setSuspendedAlert(true);
      setCheckingSession(false);
      return;
    }

    let active = true;
    fetchMeWithSessionToken()
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          queryClient.setQueryData(queryKeys.me(res.me.id), res.me);
          router.replace(getPostAuthRoute(res.me));
          return;
        }
        if (res.suspended) {
          await performSuspendedSignOut(() => queryClient.clear());
          if (!active) return;
          setSuspendedAlert(true);
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [isSuspendedUrl, router]);

  // Shows URL-based OAuth errors or password reset success notices as toasts
  useEffect(() => {
    if (urlError === "suspended" || urlError === "ACCOUNT_SUSPENDED") {
      return;
    } else if (urlError === "ACCOUNT_DISABLED") {
      authToast.error("Your account has been disabled. Please contact support.", {
        id: "sign-in-account-disabled",
      });
    } else if (urlError === "ACCOUNT_DELETED") {
      authToast.error("This account has been deleted. Please contact support.", {
        id: "sign-in-account-deleted",
      });
    } else if (urlError === "account_not_linked") {
      authToast.warning("Account already exists", {
        id: "sign-in-account-not-linked",
        description:
          "An account with this email was previously registered using email and password. Please sign in with your password below. Once signed in, you can link your Google account in Settings.",
      });
    } else if (urlError === "access_denied") {
      authToast.error(
        "Google sign in was cancelled or access was denied. Please try again.",
        { id: "sign-in-access-denied" }
      );
    } else if (urlError) {
      authToast.error(
        `Authentication error (${urlError}). Please sign in with your email and password.`,
        { id: "sign-in-url-error" }
      );
    }

    if (urlMessage === "password_reset_success") {
      authToast.success(
        "Your password has been successfully reset. Please sign in with your new password.",
        { id: "sign-in-reset-success" }
      );
    }
  }, [urlError, urlMessage]);

  // Checks required and email format rules before calling the sign-in endpoint
  const validateFields = (cleanEmail: string, rawPassword: string) => {
    const nextErrors: { email?: string; password?: string } = {};
    if (!cleanEmail) {
      nextErrors.email = "Please enter your email address.";
    } else if (!EMAIL_PATTERN.test(cleanEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!rawPassword) {
      nextErrors.password = "Please enter your password.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Authenticates the user with email and password, then opens verify or app
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    authToast.dismiss();

    const cleanEmail = email.trim();
    if (!validateFields(cleanEmail, password)) {
      return;
    }

    setIsPending(true);

    try {
      // Authenticate user credentials directly through the Next.js auth proxy
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const isUnverified =
          res.status === 403 &&
          (data?.code === "EMAIL_NOT_VERIFIED" ||
            String(data?.message || "").toLowerCase().includes("email not verified"));

        // Open the verify page only when the account exists, password is right, and email is unverified
        if (isUnverified) {
          document.cookie = "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";
          try {
            await fetch("/api/auth/email-otp/send-verification-otp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                email: cleanEmail,
                type: "email-verification",
              }),
            });
          } catch {
            // Rate limit or send failure is handled on the verify page
          }
          router.replace("/auth/verify-otp");
          return;
        }

        // Show rate limit wait time when too many sign-in attempts occur
        if (res.status === 429) {
          const waitSeconds = Number(
            data?.retry_after || res.headers.get("Retry-After") || 60
          );
          authToast.warning("Too many attempts", {
            id: "sign-in-rate-limit",
            description: `Please wait ${waitSeconds} seconds before trying again.`,
          });
          setIsPending(false);
          return;
        }

        // Show a server error toast for 5xx responses
        if (res.status >= 500) {
          authToast.error("Something went wrong on our end. Please try again.", {
            id: "sign-in-server-error",
          });
          setIsPending(false);
          return;
        }

        // Wrong password and unknown email show the exact same message and send nothing
        authToast.error("Incorrect email or password.", {
          id: "sign-in-invalid-credentials",
        });
        setIsPending(false);
        return;
      }

      // Clear any prior signed-out sentinel flag upon authenticating
      document.cookie = "autopulse_signed_out=; path=/; max-age=0; SameSite=Lax";

      // b. Call /me ONCE with the new session token
      const meResult = await fetchMeWithSessionToken();
      if (!meResult.ok) {
        if (meResult.suspended) {
          // c. Suspended: sign out immediately, clear cache, stay on sign-in, show destructive Alert
          await performSuspendedSignOut(() => queryClient.clear());
          setSuspendedAlert(true);
          setIsPending(false);
          return;
        }
        console.error("[auth] Sign-in succeeded but active session could not be verified.");
        authToast.error(
          "Signed in, but we could not open your dashboard. Please try again.",
          { id: "sign-in-session-error" }
        );
        setIsPending(false);
        return;
      }

      // d. Active: seed React Query cache and navigate via getPostAuthRoute
      queryClient.setQueryData(queryKeys.me(meResult.me.id), meResult.me);
      router.replace(getPostAuthRoute(meResult.me));
    } catch {
      authToast.error(
        "Network error. Please check your connection and try again.",
        { id: "sign-in-network-error" }
      );
      setIsPending(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="w-full space-y-4 py-2" aria-busy="true" aria-label="Checking session">
        <Skeleton className="h-10 w-full rounded-[8px]" />
        <Skeleton className="h-4 w-16 mx-auto" />
        <Skeleton className="h-10 w-full rounded-[8px]" />
        <Skeleton className="h-10 w-full rounded-[8px]" />
        <Skeleton className="h-10 w-full rounded-[8px]" />
      </div>
    );
  }

  return (
    <div className="w-full font-normal">
      {suspendedAlert && (
        <Alert variant="destructive" className="mb-4 text-left">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Your account has been suspended. Contact support if you think this is a mistake.
          </AlertDescription>
        </Alert>
      )}
      {/* Google Social Sign In */}
      <div className="w-full">
        <GoogleSignInButton text="Continue with Google" />
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

      {/* Email and Password Form */}
      <form noValidate onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3">
          {/* Email field */}
          <div className="flex flex-col gap-1.5 text-left">
            <Label htmlFor="email" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              disabled={isPending}
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
            {/* Inline field error for email validation */}
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password field with eye toggle and forgot password link */}
          <div className="flex flex-col gap-1.5 text-left">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[13px] leading-[1.2] py-0 !font-normal text-[var(--lp-text-heading)]">
                Password
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-[13px] leading-[1.2] text-[var(--lp-ice)] hover:text-[var(--lp-text-heading)] hover:underline font-normal"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                disabled={isPending}
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
            {/* Inline field error for missing password */}
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-xs leading-[1.3] text-[#ff8589] font-normal">
                {fieldErrors.password}
              </p>
            )}
          </div>
        </div>

        {/* Primary submit button: 16px below last field */}
        <Button
          type="submit"
          disabled={isPending}
          className="mt-4 w-full h-10 rounded-[8px] bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)] transition-colors !font-normal text-sm flex items-center justify-center gap-2"
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
