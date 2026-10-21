import { describe, it, expect } from "vitest";
import {
  getStatusChipConfig,
  formatRunDate,
  formatNextDraftTime,
} from "./posts";

describe("post status chip configuration", () => {
  it("returns correct labels for all statuses in plain words", () => {
    expect(getStatusChipConfig("draft").label).toBe("Draft");
    expect(getStatusChipConfig("awaiting_approval").label).toBe("Waiting for approval");
    expect(getStatusChipConfig("approved").label).toBe("Approved");
    expect(getStatusChipConfig("rejected").label).toBe("Rejected");
    expect(getStatusChipConfig("publishing").label).toBe("Publishing");
    expect(getStatusChipConfig("published").label).toBe("Published");
    expect(getStatusChipConfig("failed").label).toBe("Failed");
  });

  it("assigns appropriate color classes according to design tokens", () => {
    const draftConfig = getStatusChipConfig("draft");
    expect(draftConfig.className).toContain("bg-draft-bg");
    expect(draftConfig.className).toContain("text-draft-text");

    const approvedConfig = getStatusChipConfig("approved");
    expect(approvedConfig.className).toContain("bg-signal-soft");
    expect(approvedConfig.className).toContain("text-signal");

    const rejectedConfig = getStatusChipConfig("rejected");
    expect(rejectedConfig.className).toContain("bg-rejected-bg");
    expect(rejectedConfig.className).toContain("text-rejected-text");

    const failedConfig = getStatusChipConfig("failed");
    expect(failedConfig.className).toContain("bg-rejected-bg");
    expect(failedConfig.className).toContain("text-rejected-text");

    const publishedConfig = getStatusChipConfig("published");
    expect(publishedConfig.hasCheckIcon).toBe(true);
    expect(publishedConfig.className).toContain("text-ink");
  });
});

describe("run date formatting", () => {
  it("formats date strings into readable locale dates", () => {
    const formatted = formatRunDate("2026-10-21", "en-US");
    expect(formatted).toBe("Oct 21, 2026");
  });

  it("handles empty or invalid date strings safely", () => {
    expect(formatRunDate("")).toBe("");
    expect(formatRunDate("invalid-date")).toBe("invalid-date");
  });
});

describe("next draft time formatting", () => {
  it("formats ISO timestamps with timezone into plain words", () => {
    // 2026-10-28 06:00:00 UTC is Wednesday 6:00 AM UTC
    const formattedUtc = formatNextDraftTime("2026-10-28T06:00:00Z", "UTC");
    expect(formattedUtc).toBe("Wed 28 Oct, 6:00 AM");

    // 2026-10-28 01:00:00 UTC is Wednesday 6:00 AM in Asia/Karachi (UTC+5)
    const formattedKarachi = formatNextDraftTime("2026-10-28T01:00:00Z", "Asia/Karachi");
    expect(formattedKarachi).toBe("Wed 28 Oct, 6:00 AM");
  });

  it("returns null for missing or invalid timestamps", () => {
    expect(formatNextDraftTime(null)).toBeNull();
    expect(formatNextDraftTime(undefined)).toBeNull();
    expect(formatNextDraftTime("not-a-timestamp")).toBeNull();
  });
});
