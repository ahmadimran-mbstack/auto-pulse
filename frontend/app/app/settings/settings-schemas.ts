import { z } from "zod";

// Shared validation constants matching backend Pydantic validators
export const NICHE_MIN_LENGTH = 1;
export const NICHE_MAX_LENGTH = 500;
export const ROLE_MAX_LENGTH = 80;
export const INDUSTRY_MAX_LENGTH = 80;
export const AUDIENCE_MAX_LENGTH = 200;
export const VOICE_NOTES_MAX_LENGTH = 500;
export const SAMPLE_POSTS_MAX_LENGTH = 3000;
export const BRAND_NAME_MAX_LENGTH = 60;

// Shared niche description schema used by both onboarding and settings
export const nicheDescriptionField = z
  .string()
  .trim()
  .min(NICHE_MIN_LENGTH, "Niche description is required.")
  .max(NICHE_MAX_LENGTH, `Use at most ${NICHE_MAX_LENGTH} characters.`);

// Shared schema for onboarding step 1
export const onboardingStep1Schema = z.object({
  role_title: z.string().trim().max(ROLE_MAX_LENGTH, `Use at most ${ROLE_MAX_LENGTH} characters.`).optional(),
  industry: z.string().trim().max(INDUSTRY_MAX_LENGTH, `Use at most ${INDUSTRY_MAX_LENGTH} characters.`).optional(),
  niche_description: nicheDescriptionField,
  audience: z.string().trim().max(AUDIENCE_MAX_LENGTH, `Use at most ${AUDIENCE_MAX_LENGTH} characters.`).optional(),
  topics_include: z.array(z.string()).max(10, "You can add at most 10 topics."),
  topics_avoid: z.array(z.string()).max(10, "You can add at most 10 topics."),
});

export const profileFormSchema = z.object({
  display_name: z.string().max(100, "Name must be 100 characters or less").optional(),
  role_title: z.string().trim().max(ROLE_MAX_LENGTH, `Use at most ${ROLE_MAX_LENGTH} characters.`).optional(),
  industry: z.string().trim().max(INDUSTRY_MAX_LENGTH, `Use at most ${INDUSTRY_MAX_LENGTH} characters.`).optional(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const contentFormSchema = z.object({
  niche_description: nicheDescriptionField,
  audience: z.string().trim().max(AUDIENCE_MAX_LENGTH, `Use at most ${AUDIENCE_MAX_LENGTH} characters.`).optional(),
  topics_include: z.array(z.string()),
  topics_avoid: z.array(z.string()),
  tone: z
    .enum(["professional", "friendly", "direct", "educational", "inspiring"])
    .nullable()
    .optional(),
  voice_notes: z.string().trim().max(VOICE_NOTES_MAX_LENGTH, `Use at most ${VOICE_NOTES_MAX_LENGTH} characters.`).optional(),
  sample_posts: z.string().trim().max(SAMPLE_POSTS_MAX_LENGTH, `Use at most ${SAMPLE_POSTS_MAX_LENGTH} characters.`).optional(),
});

export type ContentFormValues = z.infer<typeof contentFormSchema>;

export const brandFormSchema = z.object({
  brand_name: z.string().max(100, "Brand name must be 100 characters or less").optional(),
  brand_primary_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid 6-digit hex color code")
    .or(z.literal(""))
    .optional(),
  brand_accent_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid 6-digit hex color code")
    .or(z.literal(""))
    .optional(),
});

export type BrandFormValues = z.infer<typeof brandFormSchema>;

export const scheduleFormSchema = z
  .object({
    timezone: z.string().min(1, "Please select a timezone"),
    post_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Post time must be in HH:MM format"),
    post_days: z
      .array(z.number().min(0).max(6))
      .min(1, "Select at least one day to schedule posts"),
    approval_lead_minutes: z
      .number()
      .int()
      .refine((v) => [60, 180, 360, 720].includes(v), {
        message: "Choose 1, 3, 6, or 12 hours before publish",
      })
      .default(180),
    approval_method: z.enum(["email", "slack", "both"]),
    email_approval_enabled: z.boolean(),
    slack_approval_enabled: z.boolean(),
  })
  .refine(
    (data) => data.email_approval_enabled || data.slack_approval_enabled,
    {
      message: "Select at least one approval notification method (Email or Slack)",
      path: ["approval_method"],
    }
  );

export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password must be 128 characters or fewer"),
  revokeOtherSessions: z.boolean(),
});

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
