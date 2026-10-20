"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

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
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      {/* Top Application Bar */}
      <header className="border-b border-line bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1160px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/app" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-[8px] bg-surface border border-line flex items-center justify-center text-signal group-hover:border-signal/40 transition-colors">
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

          <div className="text-xs font-mono text-muted">
            Setup in progress
          </div>
        </div>
      </header>

      {/* Main Form Column (max 560px, left-aligned) */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10">
        <div className="max-w-[560px] text-left">
          {/* Progress Indicator */}
          <div className="mb-8" aria-label={`Step ${step} of 4`}>
            <div className="flex items-center justify-between text-xs font-medium text-muted mb-2 font-mono">
              <span>Step {step} of 4</span>
              <span>{step * 25}% complete</span>
            </div>
            {/* Four-segment thin progress bar */}
            <div className="grid grid-cols-4 gap-1.5 h-1 w-full" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={4}>
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className={`h-full rounded-full transition-colors duration-200 ${
                    seg <= step ? "bg-signal" : "bg-line"
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
              className="text-3xl font-geist font-normal tracking-tighter text-ink mb-2 outline-none"
            >
              {title}
            </h1>
            <p className="text-sm text-muted max-prose-copy">
              {subtitle}
            </p>
          </div>

          {/* Top-level general error banner */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-[8px] bg-rejected-bg border border-[#F5C2B9] text-sm text-rejected-text"
            >
              {errorMessage}
            </div>
          )}

          {/* Form fields content */}
          <form onSubmit={onSubmit} className="space-y-6">
            {children}

            {/* Bottom Bar: Back & Save (sticky on mobile viewports) */}
            <div className="pt-8 pb-12 sm:pb-4 border-t border-line mt-10 sticky bottom-0 bg-paper/95 backdrop-blur-xs flex items-center justify-between gap-4 z-20">
              {backHref ? (
                <Link
                  href={backHref}
                  className="px-4 py-2 rounded-[8px] border border-line bg-surface hover:bg-paper text-sm font-medium text-ink transition-colors cursor-pointer"
                >
                  Back
                </Link>
              ) : onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-4 py-2 rounded-[8px] border border-line bg-surface hover:bg-paper text-sm font-medium text-ink transition-colors cursor-pointer"
                >
                  Back
                </button>
              ) : (
                <div />
              )}

              <button
                type="submit"
                disabled={isSaving || saveDisabled}
                className="px-6 py-2.5 rounded-[8px] bg-signal hover:bg-signal-hover text-surface text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xs"
              >
                {isSaving ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin text-surface"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <span>Saving</span>
                  </>
                ) : (
                  <span>{saveButtonText}</span>
                )}
              </button>
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
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <header className="border-b border-line bg-surface h-16" />
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10">
        <div className="max-w-[560px] space-y-6 animate-pulse">
          <div className="h-4 bg-line rounded-md w-24 mb-2" />
          <div className="grid grid-cols-4 gap-1.5 h-1 w-full">
            <div className="h-full bg-line rounded-full" />
            <div className="h-full bg-line rounded-full" />
            <div className="h-full bg-line rounded-full" />
            <div className="h-full bg-line rounded-full" />
          </div>
          <div className="h-8 bg-line rounded-md w-3/4 mt-8" />
          <div className="h-4 bg-line rounded-md w-1/2" />
          <div className="space-y-4 pt-6">
            <div className="h-10 bg-line rounded-md w-full" />
            <div className="h-28 bg-line rounded-md w-full" />
            <div className="h-10 bg-line rounded-md w-full" />
          </div>
        </div>
      </main>
    </div>
  );
}
