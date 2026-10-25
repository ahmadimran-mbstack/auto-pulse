"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, Loader2 } from "lucide-react";

interface OnboardingShellProps {
  step: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  backHref?: string;
  onBack?: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSaving: boolean;
  saveButtonText?: string;
  saveDisabled?: boolean;
  errorMessage?: string | null;
}

// Shell layout wrapping each step of the four-part onboarding wizard
export function OnboardingShell({
  step,
  title,
  subtitle,
  children,
  backHref,
  onBack,
  onSubmit,
  isSaving,
  saveButtonText = "Save and continue",
  saveDisabled = false,
  errorMessage,
}: OnboardingShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Moves focus to the h1 heading when the step changes for accessibility
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Application Bar */}
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="page-container mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/app" className="flex items-center gap-2 group">
            <div className="size-7 rounded-md bg-card border border-border flex items-center justify-center text-primary group-hover:border-primary/40 transition-colors">
              <Activity className="size-4" strokeWidth={2} />
            </div>
            <span className="font-display font-semibold text-h3 text-foreground">
              AutoPulse
            </span>
          </Link>

          <div className="text-caption text-muted-foreground font-mono">
            Setup in progress
          </div>
        </div>
      </header>

      {/* Main Form Column (max 720px form-container) */}
      <main className="flex-1 form-container w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="text-left">
          {/* Progress Indicator */}
          <div className="mb-8" aria-label={`Step ${step} of 4`}>
            <div className="flex items-center justify-between text-caption font-medium text-muted-foreground mb-2 font-mono">
              <span>Step {step} of 4</span>
              <span className="tabular-nums">{step * 25}% complete</span>
            </div>
            {/* Four-segment progress bar */}
            <div
              className="grid grid-cols-4 gap-2 h-1.5 w-full"
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={4}
            >
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className={`h-full rounded-full transition-colors duration-200 ${
                    seg <= step ? "bg-primary" : "bg-secondary"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Heading and context sentence */}
          <div className="mb-8">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-title font-display text-foreground mb-2 outline-none"
            >
              {title}
            </h1>
            <p className="text-body text-muted-foreground">
              {subtitle}
            </p>
          </div>

          {/* Top-level general error banner */}
          {errorMessage && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="size-4 shrink-0" />
              <AlertDescription className="text-meta">
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Form fields content */}
          <form onSubmit={onSubmit} className="space-y-6">
            {children}

            {/* Bottom Bar: Back and Save controls */}
            <div className="pt-8 pb-4 border-t border-border mt-10 flex items-center justify-between gap-4">
              {backHref ? (
                <Button variant="outline" asChild>
                  <Link href={backHref}>Back</Link>
                </Button>
              ) : onBack ? (
                <Button type="button" variant="outline" onClick={onBack}>
                  Back
                </Button>
              ) : (
                <div />
              )}

              <Button
                type="submit"
                disabled={isSaving || saveDisabled}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Saving</span>
                  </>
                ) : (
                  <span>{saveButtonText}</span>
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

// Calm skeleton placeholder while fetching profile data
export function OnboardingSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card h-14" />
      <main className="flex-1 form-container w-full mx-auto px-4 sm:px-6 py-10">
        <div className="space-y-6">
          <Skeleton className="h-4 w-24 mb-2" />
          <div className="grid grid-cols-4 gap-2 h-1.5 w-full">
            <Skeleton className="h-full rounded-full" />
            <Skeleton className="h-full rounded-full" />
            <Skeleton className="h-full rounded-full" />
            <Skeleton className="h-full rounded-full" />
          </div>
          <Skeleton className="h-8 w-3/4 mt-8" />
          <Skeleton className="h-4 w-1/2" />
          <div className="space-y-4 pt-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </main>
    </div>
  );
}
