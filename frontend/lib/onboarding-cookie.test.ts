import { describe, it, expect } from "vitest";
import {
  createOnboardingCookieValue,
  verifyOnboardingCookie,
  ONBOARDING_COMPLETED_COOKIE,
} from "./onboarding-cookie";

describe("onboarding-cookie", () => {
  it("exports correct cookie name", () => {
    expect(ONBOARDING_COMPLETED_COOKIE).toBe("autopulse_onboarding_completed");
  });

  it("creates and verifies a valid cookie for a user", () => {
    const userId = "usr_123456";
    const cookieVal = createOnboardingCookieValue(userId);
    expect(cookieVal).toContain(userId);
    expect(verifyOnboardingCookie(userId, cookieVal)).toBe(true);
  });

  it("rejects an invalid or tampered cookie", () => {
    const userId = "usr_123456";
    const cookieVal = createOnboardingCookieValue(userId);

    // Tampered user ID
    expect(verifyOnboardingCookie("usr_999999", cookieVal)).toBe(false);

    // Tampered signature
    const tampered = cookieVal.slice(0, -4) + "0000";
    expect(verifyOnboardingCookie(userId, tampered)).toBe(false);

    // Missing cookie
    expect(verifyOnboardingCookie(userId, null)).toBe(false);
    expect(verifyOnboardingCookie(userId, undefined)).toBe(false);
    expect(verifyOnboardingCookie(userId, "")).toBe(false);

    // Malformed cookie
    expect(verifyOnboardingCookie(userId, "invalid-no-dot")).toBe(false);
  });
});

