"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveStep4, completeOnboarding, ApiClientError } from "@/lib/api";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import { TimezoneSelect } from "../components/TimezoneSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformLabel } from "@/components/app/PlatformLabel";

interface DayOption {
  day: number;
  label: string;
  name: string;
}

const DAY_OPTIONS: DayOption[] = [
  { day: 0, label: "Mon", name: "Monday" },
  { day: 1, label: "Tue", name: "Tuesday" },
  { day: 2, label: "Wed", name: "Wednesday" },
  { day: 3, label: "Thu", name: "Thursday" },
  { day: 4, label: "Fri", name: "Friday" },
  { day: 5, label: "Sat", name: "Saturday" },
  { day: 6, label: "Sun", name: "Sunday" },
];

export default function OnboardingStep5Page() {
  const router = useRouter();

  // Loading and submission state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Controlled form state
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [postTime, setPostTime] = useState("09:00");
  const [postDays, setPostDays] = useState<number[]>([0, 1, 2, 3, 4]); // Default Mon-Fri
  const approvalMethod = "email"; // Fixed to email today

  // Element references for focusing the first invalid input
  const postTimeRef = useRef<HTMLInputElement>(null);

  // Load existing profile to prefill fields and ensure earlier steps were completed
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const profile = await getProfile();
        if (!isMounted) return;

        // Guard: check that Steps 1, 2, and 3 are completed
        if (!profile.niche_description || (profile.onboarding_step ?? 0) < 1) {
          router.replace("/app/onboarding/1");
          return;
        }

        if (!profile.tone || (profile.onboarding_step ?? 0) < 2) {
          router.replace("/app/onboarding/2");
          return;
        }

        if (!profile.brand_name || (profile.onboarding_step ?? 0) < 3) {
          router.replace("/app/onboarding/3");
          return;
        }

        if (profile.timezone) setTimezone(profile.timezone);
        if (profile.post_time) setPostTime(profile.post_time);
        if (Array.isArray(profile.post_days) && profile.post_days.length > 0) {
          setPostDays(profile.post_days);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load profile";
        setGeneralError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Toggle selection of a day
  const toggleDay = (day: number) => {
    if (postDays.includes(day)) {
      setPostDays(postDays.filter((d) => d !== day));
    } else {
      setPostDays([...postDays, day].sort((a, b) => a - b));
    }
  };

  // Client validation
  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!timezone.trim()) {
      errors.timezone = "Please select a timezone.";
    }

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(postTime)) {
      errors.post_time = "Post time must be in HH:MM format.";
    }

    if (!postDays || postDays.length === 0) {
      errors.post_days = "Please select at least one day to schedule posts.";
    }

    return errors;
  };

  const focusFirstError = (errors: Record<string, string>) => {
    if (errors.post_time) {
      postTimeRef.current?.focus();
    }
  };

  // Route 422 errors from POST /profile/onboarding/complete back to earlier steps if needed
  const handleCompleteFailure = (fields: Record<string, string>) => {
    const step1Fields = ["role_title", "industry", "niche_description", "audience", "topics_include", "topics_avoid"];
    const step2Fields = ["tone", "voice_notes", "sample_posts"];
    const step3Fields = ["brand_name", "brand_primary_hex", "brand_accent_hex"];

    const hasStep1 = Object.keys(fields).some((f) => step1Fields.includes(f));
    if (hasStep1) {
      router.push("/app/onboarding/1");
      return;
    }

    const hasStep2 = Object.keys(fields).some((f) => step2Fields.includes(f));
    if (hasStep2) {
      router.push("/app/onboarding/2");
      return;
    }

    const hasStep3 = Object.keys(fields).some((f) => step3Fields.includes(f));
    if (hasStep3) {
      router.push("/app/onboarding/3");
      return;
    }

    setFieldErrors(fields);
    focusFirstError(fields);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    const localErrors = validateForm();
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      focusFirstError(localErrors);
      return;
    }

    setIsSaving(true);
    try {
      // Step 1: Save Step 4 data (scheduling preferences)
      await saveStep4({
        timezone,
        post_time: postTime,
        post_days: postDays,
        approval_method: approvalMethod,
      });

      // Step 2: Finalize onboarding via complete endpoint
      await completeOnboarding();

      // Step 3: Navigate to active dashboard
      router.push("/app");
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.status === 422 && err.fields) {
          handleCompleteFailure(err.fields);
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError(err instanceof Error ? err.message : "An unexpected error occurred while saving. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <OnboardingSkeleton />;
  }

  return (
    <OnboardingShell
      step={5}
      title="When should we draft your posts?"
      subtitle="Set your preferred publishing rhythm and review schedule for daily LinkedIn drafts."
      backHref="/app/onboarding/4"
      onSubmit={handleSubmit}
      isSaving={isSaving}
      saveButtonText="Finish setup"
      errorMessage={generalError}
    >
      {/* Searchable Timezone */}
      <TimezoneSelect
        id="timezone"
        value={timezone}
        onChange={setTimezone}
        error={fieldErrors.timezone}
      />

      {/* Time to Post */}
      <div className="space-y-1.5 text-left pt-2">
        <Label htmlFor="post_time">
          Time to post <span className="text-primary">*</span>
        </Label>
        <p id="post_time-hint" className="text-caption text-muted-foreground">
          The time of day when your post will be ready for review.
        </p>
        <Input
          id="post_time"
          ref={postTimeRef}
          type="time"
          value={postTime}
          onChange={(e) => setPostTime(e.target.value)}
          aria-describedby={`post_time-hint ${
            fieldErrors.post_time ? "post_time-error" : ""
          }`.trim()}
          className={`max-w-xs font-mono tabular-nums ${
            fieldErrors.post_time ? "border-destructive" : ""
          }`}
        />
        {fieldErrors.post_time && (
          <p id="post_time-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.post_time}
          </p>
        )}
      </div>

      {/* Days of the Week as Seven Toggle Buttons */}
      <div className="space-y-2 text-left pt-2">
        <Label>
          Days of the week <span className="text-primary">*</span>
        </Label>
        <p id="post_days-hint" className="text-caption text-muted-foreground">
          Select which days you want AutoPulse to generate drafts.
        </p>

        <div
          role="group"
          aria-describedby="post_days-hint"
          aria-label="Publishing days of the week"
          className="flex flex-wrap gap-2 pt-1"
        >
          {DAY_OPTIONS.map((opt) => {
            const isSelected = postDays.includes(opt.day);
            return (
              <label
                key={opt.day}
                className={`inline-flex items-center justify-center px-4 py-2 rounded-md border text-caption font-medium cursor-pointer transition-colors select-none ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-secondary/40"
                }`}
              >
                <input
                  type="checkbox"
                  value={opt.day}
                  checked={isSelected}
                  onChange={() => toggleDay(opt.day)}
                  className="sr-only"
                  aria-label={opt.name}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>

        {fieldErrors.post_days && (
          <p role="alert" className="text-caption text-destructive pt-1">
            {fieldErrors.post_days}
          </p>
        )}
      </div>

      {/* Approval Method (Single Radio) */}
      <div className="space-y-2 text-left pt-4">
        <Label>
          Approval method <span className="text-primary">*</span>
        </Label>
        <div className="p-3.5 rounded-md border border-signal-line bg-signal-soft/40 flex items-start gap-3">
          <input
            type="radio"
            id="approval-email"
            name="approval_method"
            value="email"
            checked
            readOnly
            className="mt-1 size-4 text-primary border-border"
          />
          <div className="space-y-0.5 text-left">
            <label htmlFor="approval-email" className="text-body font-medium text-foreground cursor-pointer flex items-center gap-2">
              <PlatformLabel platform="email" size="sm" />
            </label>
            <p className="text-caption text-muted-foreground">
              We will email you each draft to approve.
            </p>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}
