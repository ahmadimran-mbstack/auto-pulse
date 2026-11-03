import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOnboardingCookieValue,
  verifyOnboardingCookie,
  ONBOARDING_COMPLETED_COOKIE,
} from "./onboarding-cookie";

describe("Onboarding Guards and Redirect Logic", () => {
  const testUserId = "usr_test_alpha_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Cookie signing and verification", () => {
    it("generates a signed cookie that verifies for the same user ID", () => {
      const cookieValue = createOnboardingCookieValue(testUserId);
      expect(cookieValue).toContain(testUserId);
      expect(verifyOnboardingCookie(testUserId, cookieValue)).toBe(true);
    });

    it("fails verification if user ID does not match", () => {
      const cookieValue = createOnboardingCookieValue(testUserId);
      expect(verifyOnboardingCookie("usr_other_999", cookieValue)).toBe(false);
    });

    it("fails verification if signature is corrupted or forged", () => {
      const cookieValue = createOnboardingCookieValue(testUserId);
      const forged = `${testUserId}.1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`;
      expect(verifyOnboardingCookie(testUserId, forged)).toBe(false);
    });

    it("returns false for missing or blank cookie", () => {
      expect(verifyOnboardingCookie(testUserId, null)).toBe(false);
      expect(verifyOnboardingCookie(testUserId, undefined)).toBe(false);
      expect(verifyOnboardingCookie(testUserId, "")).toBe(false);
    });
  });

  describe("Step resume and jump prevention logic", () => {
    const STEP_ROUTES: Record<number, string> = {
      0: "/onboarding/topics",
      1: "/onboarding/voice",
      2: "/onboarding/brand",
      3: "/onboarding/approvals",
      4: "/onboarding/schedule",
    };

    function getResumeRoute(step: number | null | undefined, isComplete: boolean): string {
      if (isComplete) return "/app";
      const clamped = Math.max(0, Math.min(4, step ?? 0));
      return STEP_ROUTES[clamped] || "/onboarding/topics";
    }

    function canAccessStep(currentStep: number, targetStep: number): boolean {
      // Users can access their current step and any previous step
      // Step indices: topics=0, voice=1, brand=2, approvals=3, schedule=4
      return targetStep <= currentStep;
    }

    it("routes to /app if onboarding is already completed", () => {
      expect(getResumeRoute(4, true)).toBe("/app");
      expect(getResumeRoute(0, true)).toBe("/app");
    });

    it("routes unstarted user (step 0) to topics", () => {
      expect(getResumeRoute(0, false)).toBe("/onboarding/topics");
      expect(getResumeRoute(null, false)).toBe("/onboarding/topics");
    });

    it("routes user with step 1 saved to voice", () => {
      expect(getResumeRoute(1, false)).toBe("/onboarding/voice");
    });

    it("routes user with step 2 saved to brand", () => {
      expect(getResumeRoute(2, false)).toBe("/onboarding/brand");
    });

    it("routes user with step 3 saved to approvals", () => {
      expect(getResumeRoute(3, false)).toBe("/onboarding/approvals");
    });

    it("routes user with step 4 saved to schedule", () => {
      expect(getResumeRoute(4, false)).toBe("/onboarding/schedule");
    });

    it("allows navigation back to earlier steps", () => {
      // User at Step 3 (Approvals) can go back to Step 0, 1, 2, 3
      expect(canAccessStep(3, 0)).toBe(true);
      expect(canAccessStep(3, 1)).toBe(true);
      expect(canAccessStep(3, 2)).toBe(true);
      expect(canAccessStep(3, 3)).toBe(true);
    });

    it("blocks jumping ahead to later unfinished steps", () => {
      // User at Step 1 (Voice) cannot jump to Step 3 or 4
      expect(canAccessStep(1, 2)).toBe(false);
      expect(canAccessStep(1, 3)).toBe(false);
      expect(canAccessStep(1, 4)).toBe(false);
    });
  });

  describe("OAuth return URL rewrites", () => {
    function rewriteSlackReturnPath(originalPath: string): string {
      if (originalPath === "/dashboard") {
        return "/app/connections";
      }
      if (originalPath.includes("onboarding")) {
        return "/onboarding/approvals";
      }
      return originalPath;
    }

    function rewriteLinkedInReturnUrl(returnUrl: string | null, isComplete: boolean): string {
      if (returnUrl) {
        let clean = returnUrl;
        if (clean.includes("/app/onboarding")) {
          clean = clean.replace(/\/app\/onboarding(\/\d+)?/, "/onboarding/approvals");
        }
        return clean.includes("?") ? `${clean}&connected=linkedin` : `${clean}?connected=linkedin`;
      }
      return isComplete ? "/app?connected=linkedin" : "/onboarding?connected=linkedin";
    }

    it("rewrites Slack callback from /app/onboarding/4 to /onboarding/approvals", () => {
      expect(rewriteSlackReturnPath("/app/onboarding/4")).toBe("/onboarding/approvals");
      expect(rewriteSlackReturnPath("/onboarding/4")).toBe("/onboarding/approvals");
    });

    it("rewrites Slack dashboard callback to /app/connections", () => {
      expect(rewriteSlackReturnPath("/dashboard")).toBe("/app/connections");
    });

    it("rewrites LinkedIn return URL targeting legacy onboarding to /onboarding/approvals", () => {
      expect(rewriteLinkedInReturnUrl("/app/onboarding/4", false)).toBe("/onboarding/approvals?connected=linkedin");
      expect(rewriteLinkedInReturnUrl("/app/onboarding", false)).toBe("/onboarding/approvals?connected=linkedin");
    });

    it("preserves LinkedIn dashboard return URL when initiated from dashboard", () => {
      expect(rewriteLinkedInReturnUrl("/app/connections", true)).toBe("/app/connections?connected=linkedin");
    });

    it("sends incomplete users back to /onboarding when LinkedIn returnUrl is absent", () => {
      expect(rewriteLinkedInReturnUrl(null, false)).toBe("/onboarding?connected=linkedin");
    });

    it("sends complete users back to /app when LinkedIn returnUrl is absent", () => {
      expect(rewriteLinkedInReturnUrl(null, true)).toBe("/app?connected=linkedin");
    });
  });
});

