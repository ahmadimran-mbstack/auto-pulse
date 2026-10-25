import { describe, it, expect } from "vitest";
import { mapTabToStatusFilter } from "./posts";

describe("status filter mapping for posts tab filters", () => {
  it("maps 'all' tab to undefined so all posts are fetched", () => {
    expect(mapTabToStatusFilter("all")).toBeUndefined();
  });

  it("maps 'needs_approval' tab to awaiting_approval status", () => {
    expect(mapTabToStatusFilter("needs_approval")).toBe("awaiting_approval");
  });

  it("maps 'scheduled' tab to approved status", () => {
    expect(mapTabToStatusFilter("scheduled")).toBe("approved");
  });

  it("maps 'published' tab to published status", () => {
    expect(mapTabToStatusFilter("published")).toBe("published");
  });

  it("maps 'problems' tab to failed, rejected, and expired statuses", () => {
    expect(mapTabToStatusFilter("problems")).toBe("failed,rejected,expired");
  });
});
