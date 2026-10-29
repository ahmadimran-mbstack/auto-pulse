// Type definitions for AutoPulse user profiles and onboarding payloads

export type Tone =
  | "professional"
  | "friendly"
  | "direct"
  | "educational"
  | "inspiring";

export type ToneChoice = Tone;

export type ApprovalMethod = "email" | "slack" | "both" | "whatsapp";

export interface ProfileApprovalSettings {
  email: boolean;
  slack: {
    available: boolean;
    enabled: boolean;
  };
}

export interface Profile {
  display_name: string | null;
  role_title: string | null;
  industry: string | null;
  niche_description: string | null;
  audience: string | null;
  topics_include: string[];
  topics_avoid: string[];
  tone: Tone | null;
  voice_notes: string | null;
  sample_posts: string | null;
  brand_name: string | null;
  brand_primary_hex: string | null;
  brand_accent_hex: string | null;
  timezone: string | null;
  post_time: string | null;
  post_days: number[];
  approval_method: ApprovalMethod;
  slack_approval_enabled?: boolean;
  approval?: ProfileApprovalSettings;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Step1Payload {
  role_title?: string | null;
  industry?: string | null;
  niche_description?: string | null;
  audience?: string | null;
  topics_include?: string[];
  topics_avoid?: string[];
}

export interface Step2Payload {
  tone?: Tone | null;
  voice_notes?: string | null;
  sample_posts?: string | null;
}

export interface Step3Payload {
  brand_name?: string | null;
  brand_primary_hex?: string | null;
  brand_accent_hex?: string | null;
}

export interface Step4Payload {
  timezone?: string | null;
  post_time?: string | null;
  post_days?: number[];
  approval_method?: ApprovalMethod;
}

export interface PatchProfileApprovalPayload {
  slack_enabled?: boolean;
}

// Partial profile payload for PATCH /profile endpoint
export type PatchProfilePayload = Partial<
  Omit<Profile, "onboarding_step" | "onboarding_completed_at" | "created_at" | "updated_at" | "approval">
> & {
  approval?: PatchProfileApprovalPayload;
};

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

