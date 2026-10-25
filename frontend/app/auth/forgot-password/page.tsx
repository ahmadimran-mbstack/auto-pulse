"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthStatusLegend } from "../components/AuthStatusLegend";
import { Activity, AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Send password reset OTP code via Neon Auth Email OTP endpoint
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          type: "forget-password",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        const msg = data.error?.message || data.message || "Failed to send reset code. Please try again.";
        setError(msg);
      } else {
        // Redirect directly to the reset-password page with email prefilled
        router.push(`/auth/reset-password?email=${encodeURIComponent(cleanEmail)}`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while requesting password reset.";
      setError(message);
    } finally {
      setIsPending(false);
    }
  };

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
          {/* Left Column: Forgot password form */}
          <div className="w-full max-w-sm text-left">
            <h1 className="text-title font-display text-foreground mb-2">
              Reset your password
            </h1>
            <p className="text-body text-muted-foreground mb-6">
              Enter your account email and we will send you a verification code to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
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

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <AlertDescription className="text-meta">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={isPending || !email.trim()}
                className="w-full"
              >
                {isPending ? "Sending code..." : "Send reset code"}
              </Button>

              <div className="pt-2 text-center space-y-2">
                <div>
                  <Link
                    href={`/auth/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
                    className="text-caption text-muted-foreground hover:text-foreground inline-block"
                  >
                    Already have a reset code? <span className="text-primary underline">Enter code</span>
                  </Link>
                </div>
                <div>
                  <Link
                    href="/auth/sign-in"
                    className="text-caption text-muted-foreground hover:text-foreground inline-block"
                  >
                    Remember your password? <span className="text-primary underline">Sign in</span>
                  </Link>
                </div>
              </div>
            </form>

            <div className="mt-8 pt-6 border-t border-border text-body text-muted-foreground">
              <span>Do not have an account? </span>
              <Link
                href="/auth/sign-up"
                className="text-primary font-medium hover:underline"
              >
                Create your account
              </Link>
            </div>
          </div>

          {/* Right Column: Status legend (desktop only) */}
          <div className="hidden lg:flex justify-end">
            <AuthStatusLegend />
          </div>
        </div>
      </main>
    </div>
  );
}
