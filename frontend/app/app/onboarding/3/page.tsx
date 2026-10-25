"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile, saveStep3, ApiClientError } from "@/lib/api";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import { BrandPreviewCard } from "@/app/app/components/BrandPreviewCard";
import { ColorField } from "@/components/app/ColorField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [primaryHex, setPrimaryHex] = useState(() => ["#", "0B7F70"].join(""));
  const [accentHex, setAccentHex] = useState(() => ["#", "14B8A6"].join(""));

  // Element references for focusing the first invalid input
  const brandNameRef = useRef<HTMLInputElement>(null);

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

  if (loading) {
    return <OnboardingSkeleton />;
  }

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
          <Label htmlFor="brand_name">
            Brand name <span className="text-primary">*</span>
          </Label>
          <span
            className={`text-caption font-mono tabular-nums ${
              brandName.length > 60 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {brandName.length} / 60 characters
          </span>
        </div>
        <p id="brand_name-hint" className="text-caption text-muted-foreground">
          Your personal or company brand name as it should appear on your social graphics.
        </p>
        <Input
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
          className={fieldErrors.brand_name ? "border-destructive" : ""}
        />
        {fieldErrors.brand_name && (
          <p id="brand_name-error" role="alert" className="text-caption text-destructive">
            {fieldErrors.brand_name}
          </p>
        )}
      </div>

      {/* Primary and Accent Color Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Primary Color */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="brand_primary_hex">
            Primary color <span className="text-primary">*</span>
          </Label>
          <p id="primary-color-hint" className="text-caption text-muted-foreground">
            Used as the background for image titles.
          </p>
          <ColorField
            id="brand_primary_hex"
            value={primaryHex}
            onChange={setPrimaryHex}
          />
          {fieldErrors.brand_primary_hex && (
            <p id="primary-color-error" role="alert" className="text-caption text-destructive">
              {fieldErrors.brand_primary_hex}
            </p>
          )}
        </div>

        {/* Accent Color */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="brand_accent_hex">
            Accent color <span className="text-primary">*</span>
          </Label>
          <p id="accent-color-hint" className="text-caption text-muted-foreground">
            Used for highlights and decorative bars.
          </p>
          <ColorField
            id="brand_accent_hex"
            value={accentHex}
            onChange={setAccentHex}
          />
          {fieldErrors.brand_accent_hex && (
            <p id="accent-color-error" role="alert" className="text-caption text-destructive">
              {fieldErrors.brand_accent_hex}
            </p>
          )}
        </div>
      </div>

      {/* Live Preview Card */}
      <div className="pt-4 space-y-2 text-left">
        <Label>
          Live graphics preview
        </Label>
        <p className="text-caption text-muted-foreground">
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
