"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveStep1, ApiClientError } from "@/lib/api";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import { TagInput } from "@/components/app/TagInput";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
        <Label htmlFor="role_title">
          Role or title <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="role_title"
          ref={roleTitleRef}
          type="text"
          maxLength={80}
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          placeholder="For example, VP of Engineering or Head of Growth"
          aria-describedby={fieldErrors.role_title ? "role_title-error" : undefined}
          className={fieldErrors.role_title ? "border-destructive" : ""}
        />
        {fieldErrors.role_title && (
          <p id="role_title-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.role_title}
          </p>
        )}
      </div>

      {/* Industry */}
      <div className="space-y-1.5 text-left">
        <Label htmlFor="industry">
          Industry <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="industry"
          ref={industryRef}
          type="text"
          maxLength={80}
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="For example, Enterprise SaaS, FinTech, or AI"
          aria-describedby={fieldErrors.industry ? "industry-error" : undefined}
          className={fieldErrors.industry ? "border-destructive" : ""}
        />
        {fieldErrors.industry && (
          <p id="industry-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.industry}
          </p>
        )}
      </div>

      {/* Niche description (required) */}
      <div className="space-y-1.5 text-left">
        <div className="flex items-center justify-between">
          <Label htmlFor="niche_description">
            Niche description <span className="text-primary">*</span>
          </Label>
          <span
            className={`text-caption font-mono tabular-nums ${
              nicheDescription.length > 500 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {nicheDescription.length} / 500 characters
          </span>
        </div>
        <p id="niche_description-hint" className="text-caption text-muted-foreground">
          Two or three sentences about what you want to be known for.
        </p>
        <Textarea
          id="niche_description"
          ref={nicheRef}
          rows={4}
          value={nicheDescription}
          onChange={(e) => setNicheDescription(e.target.value)}
          placeholder="For example: I help B2B tech leaders build reliable distributed systems and scale engineering teams with clear architecture principles."
          aria-describedby={`niche_description-hint ${
            fieldErrors.niche_description ? "niche_description-error" : ""
          }`.trim()}
          className={fieldErrors.niche_description ? "border-destructive" : ""}
        />
        {fieldErrors.niche_description && (
          <p id="niche_description-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.niche_description}
          </p>
        )}
      </div>

      {/* Audience */}
      <div className="space-y-1.5 text-left">
        <Label htmlFor="audience">
          Audience <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <p id="audience-hint" className="text-caption text-muted-foreground">
          Who do you want to reach?
        </p>
        <Input
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
          className={fieldErrors.audience ? "border-destructive" : ""}
        />
        {fieldErrors.audience && (
          <p id="audience-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.audience}
          </p>
        )}
      </div>

      {/* Topics to cover */}
      <div className="space-y-1.5 text-left">
        <Label htmlFor="topics_include">Topics to cover</Label>
        <p className="text-caption text-muted-foreground">
          Key concepts or themes to feature in your posts (up to 10).
        </p>
        <TagInput
          tags={topicsInclude}
          onChange={setTopicsInclude}
          placeholder="Add topic (e.g. System Design) and press Enter"
        />
        {fieldErrors.topics_include && (
          <p role="alert" className="text-caption text-destructive">
            {fieldErrors.topics_include}
          </p>
        )}
      </div>

      {/* Topics to avoid */}
      <div className="space-y-1.5 text-left">
        <Label htmlFor="topics_avoid">Topics to avoid</Label>
        <p className="text-caption text-muted-foreground">
          Subjects or buzzwords you prefer not to discuss (up to 10).
        </p>
        <TagInput
          tags={topicsAvoid}
          onChange={setTopicsAvoid}
          placeholder="Add topic (e.g. Unverified Rumors) and press Enter"
        />
        {fieldErrors.topics_avoid && (
          <p role="alert" className="text-caption text-destructive">
            {fieldErrors.topics_avoid}
          </p>
        )}
      </div>
    </OnboardingShell>
  );
}
