"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveStep2, ApiClientError } from "@/lib/api";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import type { ToneChoice } from "@/types/profile";

interface ToneOption {
  value: ToneChoice;
  label: string;
  example: string;
}

const TONE_OPTIONS: ToneOption[] = [
  {
    value: "professional",
    label: "Professional",
    example:
      '"We evaluated 100 enterprise migrations to identify the leading causes of production downtime."',
  },
  {
    value: "friendly",
    label: "Friendly",
    example:
      '"Here is what I learned this week while refactoring our core deployment workflow over coffee."',
  },
  {
    value: "direct",
    label: "Direct",
    example:
      '"Most software systems fail for one straightforward reason: unmanaged state complexity."',
  },
  {
    value: "educational",
    label: "Educational",
    example:
      '"Let us break down how distributed consensus protocols handle network partitions step by step."',
  },
  {
    value: "inspiring",
    label: "Inspiring",
    example:
      '"Every breakthrough architecture began as an unpolished prototype someone refused to abandon."',
  },
];

export default function OnboardingStep2Page() {
  const router = useRouter();

  // Loading and submission state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Controlled form state
  const [tone, setTone] = useState<ToneChoice>("professional");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [samplePosts, setSamplePosts] = useState("");

  // References for error focus
  const voiceNotesRef = useRef<HTMLTextAreaElement>(null);
  const samplePostsRef = useRef<HTMLTextAreaElement>(null);

  // Load existing profile to prefill fields and ensure Step 1 was completed
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const profile = await getProfile();
        if (!isMounted) return;

        // Guard: Step 1 required fields check. If niche_description is missing, redirect to Step 1
        if (!profile.niche_description || (profile.onboarding_step ?? 0) < 1) {
          router.replace("/app/onboarding/1");
          return;
        }

        if (profile.tone) setTone(profile.tone);
        if (profile.voice_notes) setVoiceNotes(profile.voice_notes);
        if (profile.sample_posts) setSamplePosts(profile.sample_posts);
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

  // Client validation
  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!tone) {
      errors.tone = "Please select a tone for your posts.";
    }

    if (voiceNotes.trim().length > 500) {
      errors.voice_notes = "Use at most 500 characters.";
    }

    if (samplePosts.trim().length > 3000) {
      errors.sample_posts = "Use at most 3000 characters.";
    }

    return errors;
  };

  // Focus the first invalid field
  const focusFirstError = (errors: Record<string, string>) => {
    if (errors.voice_notes) {
      voiceNotesRef.current?.focus();
    } else if (errors.sample_posts) {
      samplePostsRef.current?.focus();
    }
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
      await saveStep2({
        tone,
        voice_notes: voiceNotes.trim() || null,
        sample_posts: samplePosts.trim() || null,
      });

      // Proceed to Step 3 upon successful save
      router.push("/app/onboarding/3");
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.status === 422 && err.fields) {
          setFieldErrors(err.fields);
          focusFirstError(err.fields);
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError("An unexpected error occurred while saving. Please try again.");
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
      step={2}
      title="How should your posts sound?"
      subtitle="Select your preferred tone and provide guidelines to match your authentic writing style."
      backHref="/app/onboarding/1"
      onSubmit={handleSubmit}
      isSaving={isSaving}
      errorMessage={generalError}
    >
      {/* Tone radio group */}
      <fieldset className="space-y-3 text-left">
        <legend className="text-sm font-medium text-ink mb-1">
          Writing tone <span className="text-signal">*</span>
        </legend>
        <p id="tone-hint" className="text-xs text-muted mb-3">
          Choose the default voice that best matches your target audience.
        </p>

        <div
          role="radiogroup"
          aria-describedby="tone-hint"
          className="space-y-2.5"
        >
          {TONE_OPTIONS.map((opt) => {
            const isSelected = tone === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={`tone-${opt.value}`}
                className={`flex items-start gap-3.5 p-3.5 rounded-[10px] border cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? "border-signal bg-signal-soft/30 shadow-xs"
                    : "border-line bg-surface hover:border-signal/40 hover:bg-paper"
                }`}
              >
                <input
                  type="radio"
                  id={`tone-${opt.value}`}
                  name="tone"
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => setTone(opt.value)}
                  className="mt-1 h-4 w-4 text-signal border-line focus:ring-signal focus:ring-2 cursor-pointer accent-[#0B7F70]"
                />
                <div className="space-y-1 text-left flex-1">
                  <div className="text-sm font-medium text-ink flex items-center justify-between">
                    <span>{opt.label}</span>
                    {isSelected && (
                      <span className="text-[11px] font-mono font-medium text-signal bg-surface px-2 py-0.5 rounded-full border border-signal/20">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted leading-relaxed font-sans italic">
                    {opt.example}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {fieldErrors.tone && (
          <p role="alert" className="text-xs text-rejected-text pt-1">
            {fieldErrors.tone}
          </p>
        )}
      </fieldset>

      {/* Voice notes (optional) */}
      <div className="space-y-1.5 text-left pt-2">
        <div className="flex items-center justify-between">
          <label htmlFor="voice_notes" className="block text-sm font-medium text-ink">
            Notes about your voice <span className="text-muted font-normal">(optional)</span>
          </label>
          <span
            className={`text-xs font-mono ${
              voiceNotes.length > 500 ? "text-rejected-text" : "text-muted"
            }`}
          >
            {voiceNotes.length} / 500 characters
          </span>
        </div>
        <p id="voice_notes-hint" className="text-xs text-muted">
          Anything we should always or never do.
        </p>
        <textarea
          id="voice_notes"
          ref={voiceNotesRef}
          rows={3}
          maxLength={500}
          value={voiceNotes}
          onChange={(e) => setVoiceNotes(e.target.value)}
          placeholder="For example: Avoid buzzwords and hype. Use concise sentences. Keep takeaways practical and backed by data."
          aria-describedby={`voice_notes-hint ${
            fieldErrors.voice_notes ? "voice_notes-error" : ""
          }`.trim()}
          className={`w-full p-3 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 resize-y ${
            fieldErrors.voice_notes ? "border-rejected-text" : "border-line"
          }`}
        />
        {fieldErrors.voice_notes && (
          <p id="voice_notes-error" role="alert" className="text-xs text-rejected-text">
            {fieldErrors.voice_notes}
          </p>
        )}
      </div>

      {/* Sample posts (optional) */}
      <div className="space-y-1.5 text-left pt-2">
        <div className="flex items-center justify-between">
          <label htmlFor="sample_posts" className="block text-sm font-medium text-ink">
            Sample posts <span className="text-muted font-normal">(optional)</span>
          </label>
          <span
            className={`text-xs font-mono ${
              samplePosts.length > 3000 ? "text-rejected-text" : "text-muted"
            }`}
          >
            {samplePosts.length} / 3000 characters
          </span>
        </div>
        <p id="sample_posts-hint" className="text-xs text-muted">
          Paste one to three of your past posts so we can match your style.
        </p>
        <textarea
          id="sample_posts"
          ref={samplePostsRef}
          rows={6}
          maxLength={3000}
          value={samplePosts}
          onChange={(e) => setSamplePosts(e.target.value)}
          placeholder="Paste high-performing past posts or text excerpts that best reflect your natural voice and formatting preference."
          aria-describedby={`sample_posts-hint ${
            fieldErrors.sample_posts ? "sample_posts-error" : ""
          }`.trim()}
          className={`w-full p-3 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 resize-y ${
            fieldErrors.sample_posts ? "border-rejected-text" : "border-line"
          }`}
        />
        {fieldErrors.sample_posts && (
          <p id="sample_posts-error" role="alert" className="text-xs text-rejected-text">
            {fieldErrors.sample_posts}
          </p>
        )}
      </div>
    </OnboardingShell>
  );
}
