"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveStep3, ApiClientError } from "@/lib/api";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import { BrandPreviewCard } from "@/app/app/components/BrandPreviewCard";
import { parseHexColor } from "@/lib/contrast";

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

export default function OnboardingStep3Page() {
  const router = useRouter();

  // Loading and submission state
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Controlled form state
  const [brandName, setBrandName] = useState("");
  const [primaryHex, setPrimaryHex] = useState("#0B7F70");
  const [accentHex, setAccentHex] = useState("#14B8A6");

  // Element references for focusing the first invalid input
  const brandNameRef = useRef<HTMLInputElement>(null);
  const primaryHexRef = useRef<HTMLInputElement>(null);
  const accentHexRef = useRef<HTMLInputElement>(null);

  // Load existing profile to prefill fields and ensure earlier steps were completed
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const profile = await getProfile();
        if (!isMounted) return;

        // Guard: check that Step 1 and Step 2 are completed
        if (!profile.niche_description || (profile.onboarding_step ?? 0) < 1) {
          router.replace("/app/onboarding/1");
          return;
        }

        if (!profile.tone || (profile.onboarding_step ?? 0) < 2) {
          router.replace("/app/onboarding/2");
          return;
        }

        if (profile.brand_name) setBrandName(profile.brand_name);
        if (profile.brand_primary_hex) setPrimaryHex(profile.brand_primary_hex);
        if (profile.brand_accent_hex) setAccentHex(profile.brand_accent_hex);
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

  // Validates hex code and brand name locally
  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    const trimmedBrand = brandName.trim();

    if (!trimmedBrand) {
      errors.brand_name = "Brand name is required.";
    } else if (trimmedBrand.length > 60) {
      errors.brand_name = "Brand name must be at most 60 characters.";
    }

    if (!HEX_REGEX.test(primaryHex)) {
      errors.brand_primary_hex = "Primary color must be a valid 6-digit hex code (#RRGGBB).";
    }

    if (!HEX_REGEX.test(accentHex)) {
      errors.brand_accent_hex = "Accent color must be a valid 6-digit hex code (#RRGGBB).";
    }

    return errors;
  };

  const focusFirstError = (errors: Record<string, string>) => {
    if (errors.brand_name) {
      brandNameRef.current?.focus();
    } else if (errors.brand_primary_hex) {
      primaryHexRef.current?.focus();
    } else if (errors.brand_accent_hex) {
      accentHexRef.current?.focus();
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
      await saveStep3({
        brand_name: brandName.trim(),
        brand_primary_hex: primaryHex.toUpperCase(),
        brand_accent_hex: accentHex.toUpperCase(),
      });

      // Proceed to Step 4 upon successful save
      router.push("/app/onboarding/4");
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

  // Helper to format hex input with leading hash
  const handleHexInput = (val: string, setter: (hex: string) => void) => {
    let clean = val.trim();
    if (clean && !clean.startsWith("#")) {
      clean = `#${clean}`;
    }
    setter(clean);
  };

  if (loading) {
    return <OnboardingSkeleton />;
  }

  const validPrimaryColorPicker = parseHexColor(primaryHex) ? primaryHex : "#0B7F70";
  const validAccentColorPicker = parseHexColor(accentHex) ? accentHex : "#14B8A6";

  return (
    <OnboardingShell
      step={3}
      title="Your brand"
      subtitle="Define your brand identity and color palette for automatically generated LinkedIn graphics."
      backHref="/app/onboarding/2"
      onSubmit={handleSubmit}
      isSaving={isSaving}
      errorMessage={generalError}
    >
      {/* Brand Name */}
      <div className="space-y-1.5 text-left">
        <div className="flex items-center justify-between">
          <label htmlFor="brand_name" className="block text-sm font-medium text-ink">
            Brand name <span className="text-signal">*</span>
          </label>
          <span
            className={`text-xs font-mono ${
              brandName.length > 60 ? "text-rejected-text" : "text-muted"
            }`}
          >
            {brandName.length} / 60 characters
          </span>
        </div>
        <p id="brand_name-hint" className="text-xs text-muted">
          Your personal or company brand name as it should appear on your social graphics.
        </p>
        <input
          id="brand_name"
          ref={brandNameRef}
          type="text"
          maxLength={60}
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="For example, Jane Doe or CloudScale Systems"
          aria-describedby={`brand_name-hint ${
            fieldErrors.brand_name ? "brand_name-error" : ""
          }`.trim()}
          className={`w-full h-10 px-3 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 ${
            fieldErrors.brand_name ? "border-rejected-text" : "border-line"
          }`}
        />
        {fieldErrors.brand_name && (
          <p id="brand_name-error" role="alert" className="text-xs text-rejected-text">
            {fieldErrors.brand_name}
          </p>
        )}
      </div>

      {/* Primary and Accent Color Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
        {/* Primary Color */}
        <div className="space-y-1.5 text-left">
          <label htmlFor="brand_primary_hex" className="block text-sm font-medium text-ink">
            Primary color <span className="text-signal">*</span>
          </label>
          <p id="primary-color-hint" className="text-xs text-muted">
            Used as the background for image titles.
          </p>
          <div className="flex items-center gap-2.5">
            <input
              type="color"
              aria-label="Pick primary color"
              value={validPrimaryColorPicker}
              onChange={(e) => setPrimaryHex(e.target.value.toUpperCase())}
              className="w-10 h-10 rounded-[8px] border border-line bg-surface p-1 cursor-pointer shrink-0"
            />
            <input
              id="brand_primary_hex"
              ref={primaryHexRef}
              type="text"
              maxLength={7}
              value={primaryHex}
              onChange={(e) => handleHexInput(e.target.value, setPrimaryHex)}
              placeholder="#0B7F70"
              aria-describedby={`primary-color-hint ${
                fieldErrors.brand_primary_hex ? "primary-color-error" : ""
              }`.trim()}
              className={`w-full h-10 px-3 rounded-[8px] border bg-surface font-mono text-sm text-ink uppercase placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 ${
                fieldErrors.brand_primary_hex ? "border-rejected-text" : "border-line"
              }`}
            />
          </div>
          {fieldErrors.brand_primary_hex && (
            <p id="primary-color-error" role="alert" className="text-xs text-rejected-text">
              {fieldErrors.brand_primary_hex}
            </p>
          )}
        </div>

        {/* Accent Color */}
        <div className="space-y-1.5 text-left">
          <label htmlFor="brand_accent_hex" className="block text-sm font-medium text-ink">
            Accent color <span className="text-signal">*</span>
          </label>
          <p id="accent-color-hint" className="text-xs text-muted">
            Used for highlights and decorative bars.
          </p>
          <div className="flex items-center gap-2.5">
            <input
              type="color"
              aria-label="Pick accent color"
              value={validAccentColorPicker}
              onChange={(e) => setAccentHex(e.target.value.toUpperCase())}
              className="w-10 h-10 rounded-[8px] border border-line bg-surface p-1 cursor-pointer shrink-0"
            />
            <input
              id="brand_accent_hex"
              ref={accentHexRef}
              type="text"
              maxLength={7}
              value={accentHex}
              onChange={(e) => handleHexInput(e.target.value, setAccentHex)}
              placeholder="#14B8A6"
              aria-describedby={`accent-color-hint ${
                fieldErrors.brand_accent_hex ? "accent-color-error" : ""
              }`.trim()}
              className={`w-full h-10 px-3 rounded-[8px] border bg-surface font-mono text-sm text-ink uppercase placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 ${
                fieldErrors.brand_accent_hex ? "border-rejected-text" : "border-line"
              }`}
            />
          </div>
          {fieldErrors.brand_accent_hex && (
            <p id="accent-color-error" role="alert" className="text-xs text-rejected-text">
              {fieldErrors.brand_accent_hex}
            </p>
          )}
        </div>
      </div>

      {/* Live Preview Card */}
      <div className="pt-4 space-y-2 text-left">
        <label className="block text-sm font-medium text-ink">
          Live graphics preview
        </label>
        <p className="text-xs text-muted">
          Here is how your brand name and color pairing will render on generated social assets.
        </p>

        <div className="pt-2">
          <BrandPreviewCard
            brandName={brandName}
            primaryHex={primaryHex}
            accentHex={accentHex}
            showWarning={true}
          />
        </div>
      </div>
    </OnboardingShell>
  );
}
