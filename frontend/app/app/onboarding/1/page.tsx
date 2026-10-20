"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveStep1, ApiClientError } from "@/lib/api";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import { TagInput } from "../components/TagInput";

export default function OnboardingStep1Page() {
  const router = useRouter();

  // Loading and submission state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Controlled form state
  const [roleTitle, setRoleTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [nicheDescription, setNicheDescription] = useState("");
  const [audience, setAudience] = useState("");
  const [topicsInclude, setTopicsInclude] = useState<string[]>([]);
  const [topicsAvoid, setTopicsAvoid] = useState<string[]>([]);

  // Element references for focusing the first invalid input
  const nicheRef = useRef<HTMLTextAreaElement>(null);
  const roleTitleRef = useRef<HTMLInputElement>(null);
  const industryRef = useRef<HTMLInputElement>(null);
  const audienceRef = useRef<HTMLInputElement>(null);

  // Load existing saved profile to prefill all fields
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const profile = await getProfile();
        if (!isMounted) return;

        if (profile.role_title) setRoleTitle(profile.role_title);
        if (profile.industry) setIndustry(profile.industry);
        if (profile.niche_description) setNicheDescription(profile.niche_description);
        if (profile.audience) setAudience(profile.audience);
        if (profile.topics_include) setTopicsInclude(profile.topics_include);
        if (profile.topics_avoid) setTopicsAvoid(profile.topics_avoid);
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
  }, []);

  // Validate form inputs locally for instant feedback
  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const trimmedNiche = nicheDescription.trim();

    if (!trimmedNiche) {
      errors.niche_description = "Niche description is required.";
    } else if (trimmedNiche.length < 20) {
      errors.niche_description = "Use at least 20 characters.";
    } else if (trimmedNiche.length > 500) {
      errors.niche_description = "Use at most 500 characters.";
    }

    if (roleTitle.trim().length > 80) {
      errors.role_title = "Use at most 80 characters.";
    }
    if (industry.trim().length > 80) {
      errors.industry = "Use at most 80 characters.";
    }
    if (audience.trim().length > 200) {
      errors.audience = "Use at most 200 characters.";
    }

    if (topicsInclude.length > 10) {
      errors.topics_include = "You can add at most 10 topics.";
    }
    if (topicsAvoid.length > 10) {
      errors.topics_avoid = "You can add at most 10 topics.";
    }

    return errors;
  };

  // Focus the first invalid field
  const focusFirstError = (errors: Record<string, string>) => {
    if (errors.role_title) {
      roleTitleRef.current?.focus();
    } else if (errors.industry) {
      industryRef.current?.focus();
    } else if (errors.niche_description) {
      nicheRef.current?.focus();
    } else if (errors.audience) {
      audienceRef.current?.focus();
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
      await saveStep1({
        role_title: roleTitle.trim() || null,
        industry: industry.trim() || null,
        niche_description: nicheDescription.trim() || null,
        audience: audience.trim() || null,
        topics_include: topicsInclude,
        topics_avoid: topicsAvoid,
      });

      // Proceed to Step 2 upon successful save
      router.push("/app/onboarding/2");
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
      step={1}
      title="What do you post about?"
      subtitle="Tell us about your work and the topics you want to explore on LinkedIn."
      backHref="/app"
      onSubmit={handleSubmit}
      isSaving={isSaving}
      errorMessage={generalError}
    >
      {/* Role or title */}
      <div className="space-y-1.5 text-left">
        <label htmlFor="role_title" className="block text-sm font-medium text-ink">
          Role or title <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="role_title"
          ref={roleTitleRef}
          type="text"
          maxLength={80}
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          placeholder="For example, VP of Engineering or Head of Growth"
          aria-describedby={fieldErrors.role_title ? "role_title-error" : undefined}
          className={`w-full h-10 px-3 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 ${
            fieldErrors.role_title ? "border-rejected-text" : "border-line"
          }`}
        />
        {fieldErrors.role_title && (
          <p id="role_title-error" role="alert" className="text-xs text-rejected-text">
            {fieldErrors.role_title}
          </p>
        )}
      </div>

      {/* Industry */}
      <div className="space-y-1.5 text-left">
        <label htmlFor="industry" className="block text-sm font-medium text-ink">
          Industry <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="industry"
          ref={industryRef}
          type="text"
          maxLength={80}
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="For example, Enterprise SaaS, FinTech, or AI"
          aria-describedby={fieldErrors.industry ? "industry-error" : undefined}
          className={`w-full h-10 px-3 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 ${
            fieldErrors.industry ? "border-rejected-text" : "border-line"
          }`}
        />
        {fieldErrors.industry && (
          <p id="industry-error" role="alert" className="text-xs text-rejected-text">
            {fieldErrors.industry}
          </p>
        )}
      </div>

      {/* Niche description (required) */}
      <div className="space-y-1.5 text-left">
        <div className="flex items-center justify-between">
          <label htmlFor="niche_description" className="block text-sm font-medium text-ink">
            Niche description <span className="text-signal">*</span>
          </label>
          <span
            className={`text-xs font-mono ${
              nicheDescription.length > 500 ? "text-rejected-text" : "text-muted"
            }`}
          >
            {nicheDescription.length} / 500 characters
          </span>
        </div>
        <p id="niche_description-hint" className="text-xs text-muted">
          Two or three sentences about what you want to be known for.
        </p>
        <textarea
          id="niche_description"
          ref={nicheRef}
          rows={4}
          value={nicheDescription}
          onChange={(e) => setNicheDescription(e.target.value)}
          placeholder="For example: I help B2B tech leaders build reliable distributed systems and scale engineering teams with clear architecture principles."
          aria-describedby={`niche_description-hint ${
            fieldErrors.niche_description ? "niche_description-error" : ""
          }`.trim()}
          className={`w-full p-3 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 resize-y ${
            fieldErrors.niche_description ? "border-rejected-text" : "border-line"
          }`}
        />
        {fieldErrors.niche_description && (
          <p id="niche_description-error" role="alert" className="text-xs text-rejected-text">
            {fieldErrors.niche_description}
          </p>
        )}
      </div>

      {/* Audience */}
      <div className="space-y-1.5 text-left">
        <label htmlFor="audience" className="block text-sm font-medium text-ink">
          Audience <span className="text-muted font-normal">(optional)</span>
        </label>
        <p id="audience-hint" className="text-xs text-muted">
          Who do you want to reach?
        </p>
        <input
          id="audience"
          ref={audienceRef}
          type="text"
          maxLength={200}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="For example, Senior software engineers, engineering managers, and technical founders"
          aria-describedby={`audience-hint ${
            fieldErrors.audience ? "audience-error" : ""
          }`.trim()}
          className={`w-full h-10 px-3 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 ${
            fieldErrors.audience ? "border-rejected-text" : "border-line"
          }`}
        />
        {fieldErrors.audience && (
          <p id="audience-error" role="alert" className="text-xs text-rejected-text">
            {fieldErrors.audience}
          </p>
        )}
      </div>

      {/* Topics to cover */}
      <TagInput
        id="topics_include"
        label="Topics to cover"
        hint="Key concepts or themes to feature in your posts (up to 10)."
        tags={topicsInclude}
        onChange={setTopicsInclude}
        error={fieldErrors.topics_include}
        placeholder="Add topic (e.g. System Design) and press Enter"
      />

      {/* Topics to avoid */}
      <TagInput
        id="topics_avoid"
        label="Topics to avoid"
        hint="Subjects or buzzwords you prefer not to discuss (up to 10)."
        tags={topicsAvoid}
        onChange={setTopicsAvoid}
        error={fieldErrors.topics_avoid}
        placeholder="Add topic (e.g. Unverified Rumors) and press Enter"
      />
    </OnboardingShell>
  );
}
