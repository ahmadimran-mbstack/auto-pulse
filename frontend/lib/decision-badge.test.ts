import { describe, it, expect } from "vitest";
import { formatDecisionTime } from "./posts";

describe("PostDecisionBadge formatting", () => {
  it("formats decision timestamps into readable Month Day, Time", () => {
    // 2026-10-27T10:30:00Z
    const iso = "2026-10-27T10:30:00.000Z";
    const formatted = formatDecisionTime(iso);
    expect(formatted).toBeTruthy();
    expect(formatted).toMatch(/Oct 27/);
  });

  it("handles empty or null timestamps gracefully without throwing", () => {
    expect(formatDecisionTime(null)).toBe("");
    expect(formatDecisionTime(undefined)).toBe("");
    expect(formatDecisionTime("")).toBe("");
    expect(formatDecisionTime("invalid-date-string")).toBe("");
  });
});
