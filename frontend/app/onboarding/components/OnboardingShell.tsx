"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Loader2 } from "lucide-react";

// Properties passed into each onboarding step page
interface OnboardingShellProps {
  step: 1 | 2 | 3 | 4 | 5;
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

// Shell wrapper for all onboarding steps
// Displays progress bar, header text, form inputs, and navigation buttons
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
  const isFirstMount = useRef(true);

  // Moves screen reader and keyboard focus to the main step heading on step change
  // Skips initial page mount so refresh/landing never shows focus outlines
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className="w-full text-left">
      {/* Five-part segmented progress bar */}
      <div className="mb-8" aria-label={`Step ${step} of 5`}>
        <div className="flex items-center justify-between text-caption font-medium text-muted-foreground mb-2 font-mono">
          <span>Step {step} of 5</span>
          <span className="tabular-nums">{step * 20}% complete</span>
        </div>
        <div
          className="grid grid-cols-5 gap-2 h-1.5 w-full"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={5}
        >
          {[1, 2, 3, 4, 5].map((seg) => (
            <div
              key={seg}
              className={`h-full rounded-full transition-colors duration-200 ${
                seg <= step ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step heading and descriptive helper sentence */}
      <div className="mb-8">
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{ outline: "none", boxShadow: "none" }}
          className="text-title font-display text-foreground mb-2 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 border-none"
        >
          {title}
        </h1>
        <p className="text-body text-muted-foreground">
          {subtitle}
        </p>
      </div>

      {/* Alert banner shown when an API or validation error occurs */}
      {errorMessage && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-meta">
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Main form holding user input controls */}
      <form onSubmit={onSubmit} className="space-y-6">
        {children}

        {/* Bottom action controls: Back button and Continue button */}
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
                <span>Saving...</span>
              </>
            ) : (
              <span>{saveButtonText}</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

// Skeleton placeholder shown while loading profile state
export function OnboardingSkeleton() {
  return (
    <div className="w-full space-y-6">
      <Skeleton className="h-4 w-24 mb-2" />
      <div className="grid grid-cols-5 gap-2 h-1.5 w-full">
        <Skeleton className="h-full rounded-full" />
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
  );
}

