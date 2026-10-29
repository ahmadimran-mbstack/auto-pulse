import { describe, it, expect } from "vitest";
import {
  profileFormSchema,
  contentFormSchema,
  brandFormSchema,
  scheduleFormSchema,
  changePasswordSchema,
} from "./settings-schemas";

describe("settings-schemas", () => {
  describe("profileFormSchema", () => {
    it("accepts valid profile fields", () => {
      const res = profileFormSchema.safeParse({
        display_name: "Ada Lovelace",
        role_title: "Staff Engineer",
        industry: "Developer Tooling",
      });
      expect(res.success).toBe(true);
    });

    it("rejects excessively long strings", () => {
      const res = profileFormSchema.safeParse({
        display_name: "A".repeat(101),
      });
      expect(res.success).toBe(false);
    });
  });

  describe("contentFormSchema", () => {
    it("accepts valid content fields and tones", () => {
      const res = contentFormSchema.safeParse({
        niche_description: "Postgres internals",
        audience: "Database architects",
        topics_include: ["WAL", "MVCC"],
        topics_avoid: ["crypto"],
        tone: "educational",
        voice_notes: "Be concise",
        sample_posts: "Here is an example post",
      });
      expect(res.success).toBe(true);
    });

    it("rejects invalid tone values", () => {
      const res = contentFormSchema.safeParse({
        tone: "silly",
        topics_include: [],
        topics_avoid: [],
      });
      expect(res.success).toBe(false);
    });
  });

  describe("brandFormSchema", () => {
    it("accepts valid hex codes or empty strings", () => {
      const res = brandFormSchema.safeParse({
        brand_name: "AutoPulse",
        brand_primary_hex: "#0B7F70",
        brand_accent_hex: "#B9E2DB",
      });
      expect(res.success).toBe(true);

      const emptyRes = brandFormSchema.safeParse({
        brand_primary_hex: "",
      });
      expect(emptyRes.success).toBe(true);
    });

    it("rejects invalid hex color codes", () => {
      const res = brandFormSchema.safeParse({
        brand_primary_hex: "blue",
      });
      expect(res.success).toBe(false);
    });
  });

  describe("scheduleFormSchema", () => {
    it("accepts valid schedule configuration", () => {
      const res = scheduleFormSchema.safeParse({
        timezone: "America/New_York",
        post_time: "09:30",
        post_days: [0, 1, 2, 3, 4],
        approval_method: "email",
        email_approval_enabled: true,
        slack_approval_enabled: false,
      });
      expect(res.success).toBe(true);
    });

    it("accepts slack and both approval methods", () => {
      const slackRes = scheduleFormSchema.safeParse({
        timezone: "America/New_York",
        post_time: "09:30",
        post_days: [0, 1, 2, 3, 4],
        approval_method: "slack",
        email_approval_enabled: false,
        slack_approval_enabled: true,
      });
      expect(slackRes.success).toBe(true);

      const bothRes = scheduleFormSchema.safeParse({
        timezone: "America/New_York",
        post_time: "09:30",
        post_days: [0, 1, 2, 3, 4],
        approval_method: "both",
        email_approval_enabled: true,
        slack_approval_enabled: true,
      });
      expect(bothRes.success).toBe(true);
    });

    it("rejects when all approval methods are disabled", () => {
      const allDisabled = scheduleFormSchema.safeParse({
        timezone: "UTC",
        post_time: "09:00",
        post_days: [1],
        email_approval_enabled: false,
        slack_approval_enabled: false,
      });
      expect(allDisabled.success).toBe(false);
    });

    it("rejects invalid time formats or empty days", () => {
      const badTime = scheduleFormSchema.safeParse({
        timezone: "UTC",
        post_time: "25:99",
        post_days: [0],
        approval_method: "email",
        email_approval_enabled: true,
        slack_approval_enabled: false,
      });
      expect(badTime.success).toBe(false);

      const emptyDays = scheduleFormSchema.safeParse({
        timezone: "UTC",
        post_time: "09:00",
        post_days: [],
        approval_method: "email",
        email_approval_enabled: true,
        slack_approval_enabled: false,
      });
      expect(emptyDays.success).toBe(false);
    });
  });

  describe("changePasswordSchema", () => {
    it("requires at least 8 characters for new password", () => {
      const tooShort = changePasswordSchema.safeParse({
        currentPassword: "oldpassword123",
        newPassword: "short",
        revokeOtherSessions: true,
      });
      expect(tooShort.success).toBe(false);

      const valid = changePasswordSchema.safeParse({
        currentPassword: "oldpassword123",
        newPassword: "secureNewPassword123!",
        revokeOtherSessions: true,
      });
      expect(valid.success).toBe(true);
    });

    it("requires current password", () => {
      const missingCurrent = changePasswordSchema.safeParse({
        currentPassword: "",
        newPassword: "secureNewPassword123!",
        revokeOtherSessions: true,
      });
      expect(missingCurrent.success).toBe(false);
    });
  });
});
