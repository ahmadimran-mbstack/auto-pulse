"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveStep2, ApiClientError } from "@/lib/api";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
      {/* Tone radio options */}
      <fieldset className="space-y-3 text-left">
        <legend className="text-body font-medium text-foreground mb-1">
          Writing tone <span className="text-primary">*</span>
        </legend>
        <p id="tone-hint" className="text-caption text-muted-foreground mb-3">
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
                className={`flex items-start gap-3 p-3.5 rounded-md border cursor-pointer transition-colors ${
                  isSelected
                    ? "border-primary bg-signal-soft/40"
                    : "border-border bg-card hover:bg-secondary/40"
                }`}
              >
                <input
                  type="radio"
                  id={`tone-${opt.value}`}
                  name="tone"
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => setTone(opt.value)}
                  className="mt-1 size-4 text-primary border-border focus:ring-ring"
                />
                <div className="space-y-1 text-left flex-1">
                  <div className="text-body font-medium text-foreground flex items-center justify-between">
                    <span>{opt.label}</span>
                    {isSelected && (
                      <Badge variant="approved">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="text-caption text-muted-foreground leading-relaxed italic">
                    {opt.example}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {fieldErrors.tone && (
          <p role="alert" className="text-caption text-destructive pt-1">
            {fieldErrors.tone}
          </p>
        )}
      </fieldset>

      {/* Voice notes (optional) */}
      <div className="space-y-1.5 text-left pt-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="voice_notes">
            Notes about your voice <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <span
            className={`text-caption font-mono tabular-nums ${
              voiceNotes.length > 500 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {voiceNotes.length} / 500 characters
          </span>
        </div>
        <p id="voice_notes-hint" className="text-caption text-muted-foreground">
          Anything we should always or never do.
        </p>
        <Textarea
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
          className={fieldErrors.voice_notes ? "border-destructive" : ""}
        />
        {fieldErrors.voice_notes && (
          <p id="voice_notes-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.voice_notes}
          </p>
        )}
      </div>

      {/* Sample posts (optional) */}
      <div className="space-y-1.5 text-left pt-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="sample_posts">
            Sample posts <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <span
            className={`text-caption font-mono tabular-nums ${
              samplePosts.length > 3000 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {samplePosts.length} / 3000 characters
          </span>
        </div>
        <p id="sample_posts-hint" className="text-caption text-muted-foreground">
          Paste one to three of your past posts so we can match your style.
        </p>
        <Textarea
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
          className={fieldErrors.sample_posts ? "border-destructive" : ""}
        />
        {fieldErrors.sample_posts && (
          <p id="sample_posts-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.sample_posts}
          </p>
        )}
      </div>
    </OnboardingShell>
  );
}
