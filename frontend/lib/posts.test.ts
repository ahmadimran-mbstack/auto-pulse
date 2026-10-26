import { describe, it, expect } from "vitest";
import {
  getStatusChipConfig,
  formatRunDate,
  formatNextDraftTime,
  formatDecisionDeadline,
  getPublicationErrorInfo,
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
    expect(getStatusChipConfig("expired").label).toBe("Expired");
  });

  it("assigns appropriate color classes according to design tokens", () => {
    const draftConfig = getStatusChipConfig("draft");
    expect(draftConfig.className).toContain("bg-status-warning-bg");
    expect(draftConfig.className).toContain("text-status-warning-fg");

    const approvedConfig = getStatusChipConfig("approved");
    expect(approvedConfig.className).toContain("bg-status-info-bg");
    expect(approvedConfig.className).toContain("text-status-info-fg");

    const rejectedConfig = getStatusChipConfig("rejected");
    expect(rejectedConfig.className).toContain("bg-status-neutral-bg");
    expect(rejectedConfig.className).toContain("text-status-neutral-fg");

    const failedConfig = getStatusChipConfig("failed");
    expect(failedConfig.className).toContain("bg-status-danger-bg");
    expect(failedConfig.className).toContain("text-status-danger-fg");

    const publishedConfig = getStatusChipConfig("published");
    expect(publishedConfig.hasCheckIcon).toBe(true);
    expect(publishedConfig.className).toContain("text-foreground");

    const expiredConfig = getStatusChipConfig("expired");
    expect(expiredConfig.className).toContain("bg-status-neutral-bg");
    expect(expiredConfig.className).toContain("text-status-neutral-fg");
  });
});

describe("publication error info mapping", () => {
  it("maps connection renewal errors to reconnect action", () => {
    const info1 = getPublicationErrorInfo("token_invalid");
    expect(info1.action).toBe("reconnect");
    expect(info1.message).toContain("connection needs to be renewed");

    const info2 = getPublicationErrorInfo("connection_inactive");
    expect(info2.action).toBe("reconnect");
  });

  it("maps outcome_unknown to confirm_retry with warning style", () => {
    const info = getPublicationErrorInfo("outcome_unknown");
    expect(info.action).toBe("confirm_retry");
    expect(info.isWarning).toBe(true);
    expect(info.message).toContain("could not confirm");
  });

  it("maps window_missed to passive notice without retry", () => {
    const info = getPublicationErrorInfo("window_missed");
    expect(info.action).toBe("none");
    expect(info.message).toContain("time passed");
  });

  it("maps rejected and permission denied to retry action", () => {
    const info1 = getPublicationErrorInfo("rejected_by_linkedin");
    expect(info1.action).toBe("retry");
    expect(info1.message).toContain("did not accept");

    const info2 = getPublicationErrorInfo("permission_denied");
    expect(info2.action).toBe("retry");
  });

  it("maps rate limited and step failed to auto retry notice", () => {
    const info1 = getPublicationErrorInfo("rate_limited");
    expect(info1.action).toBe("auto_retry");
    expect(info1.message).toContain("try again shortly");

    const info2 = getPublicationErrorInfo("step_failed");
    expect(info2.action).toBe("auto_retry");
  });

  it("maps unknown codes to safe generic failure with retry", () => {
    const info = getPublicationErrorInfo("unexpected_code");
    expect(info.action).toBe("retry");
    expect(info.message).toBe("Something went wrong while publishing.");
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

describe("decision deadline formatting", () => {
  it("formats ISO timestamps with timezone into plain words", () => {
    // 2026-10-24 11:00:00 UTC is Saturday at 11:00 AM UTC
    const formattedUtc = formatDecisionDeadline("2026-10-24T11:00:00Z", "UTC");
    expect(formattedUtc).toBe("Saturday at 11:00 AM");

    // 2026-10-24 11:00:00 UTC is Saturday at 4:00 PM in Asia/Karachi (UTC+5)
    const formattedKarachi = formatDecisionDeadline("2026-10-24T11:00:00Z", "Asia/Karachi");
    expect(formattedKarachi).toBe("Saturday at 4:00 PM");
  });

  it("returns empty string for missing or invalid dates", () => {
    expect(formatDecisionDeadline(null)).toBe("");
    expect(formatDecisionDeadline(undefined)).toBe("");
    expect(formatDecisionDeadline("not-a-date")).toBe("");
  });
});

describe("next draft time formatting", () => {
  it("formats ISO timestamps with timezone into plain words", () => {
    const formattedUtc = formatNextDraftTime("2026-10-28T06:00:00Z", "UTC");
    expect(formattedUtc).toBe("Wed 28 Oct, 6:00 AM");

    const formattedKarachi = formatNextDraftTime("2026-10-28T01:00:00Z", "Asia/Karachi");
    expect(formattedKarachi).toBe("Wed 28 Oct, 6:00 AM");
  });

  it("returns null for missing or invalid timestamps", () => {
    expect(formatNextDraftTime(null)).toBeNull();
    expect(formatNextDraftTime(undefined)).toBeNull();
    expect(formatNextDraftTime("not-a-timestamp")).toBeNull();
  });
});
