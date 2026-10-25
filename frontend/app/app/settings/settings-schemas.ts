import { z } from "zod";

// Zod validation schemas for all settings tabs, mirroring backend rules

export const profileFormSchema = z.object({
  display_name: z.string().max(100, "Name must be 100 characters or less").optional(),
  role_title: z.string().max(100, "Role must be 100 characters or less").optional(),
  industry: z.string().max(100, "Industry must be 100 characters or less").optional(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const contentFormSchema = z.object({
  niche_description: z
    .string()
    .max(1000, "Niche description must be 1000 characters or less")
    .optional(),
  audience: z.string().max(500, "Audience must be 500 characters or less").optional(),
  topics_include: z.array(z.string()),
  topics_avoid: z.array(z.string()),
  tone: z
    .enum(["professional", "friendly", "direct", "educational", "inspiring"])
    .nullable()
    .optional(),
  voice_notes: z.string().max(1000, "Voice notes must be 1000 characters or less").optional(),
  sample_posts: z.string().max(2000, "Sample posts must be 2000 characters or less").optional(),
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

export const scheduleFormSchema = z.object({
  timezone: z.string().min(1, "Please select a timezone"),
  post_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Post time must be in HH:MM format"),
  post_days: z
    .array(z.number().min(0).max(6))
    .min(1, "Select at least one day to schedule posts"),
  approval_method: z.literal("email"),
});

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
