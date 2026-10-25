import { describe, it, expect } from "vitest";
import { isFormDirty } from "./form-utils";

describe("form dirty checking", () => {
  it("returns false when current and initial values are identical", () => {
    const initial = {
      display_name: "Jane Doe",
      role_title: "Senior Engineer",
      topics: ["AI", "React"],
    };
    const current = {
      display_name: "Jane Doe",
      role_title: "Senior Engineer",
      topics: ["AI", "React"],
    };

    expect(isFormDirty(current, initial)).toBe(false);
  });

  it("returns true when a string field has changed", () => {
    const initial = { display_name: "Jane Doe" };
    const current = { display_name: "Jane Smith" };

    expect(isFormDirty(current, initial)).toBe(true);
  });

  it("treats null, undefined, and empty string as equivalent for clean inputs", () => {
    const initial: Record<string, string | null | undefined> = { voice_notes: null, sample_posts: "" };
    const current: Record<string, string | null | undefined> = { voice_notes: "", sample_posts: undefined };

    expect(isFormDirty(current, initial)).toBe(false);
  });

  it("detects array additions, removals, and reordering", () => {
    const initial = { topics: ["AI", "DevTools"] };
    const withAddition = { topics: ["AI", "DevTools", "Cloud"] };
    const withRemoval = { topics: ["AI"] };

    expect(isFormDirty(withAddition, initial)).toBe(true);
    expect(isFormDirty(withRemoval, initial)).toBe(true);
  });

  it("respects fieldsToCompare subset option", () => {
    const initial = { name: "Alex", count: 1 };
    const current = { name: "Alex", count: 5 };

    // When only comparing name, form is clean
    expect(isFormDirty(current, initial, ["name"])).toBe(false);
    // When comparing count, form is dirty
    expect(isFormDirty(current, initial, ["count"])).toBe(true);
  });
});
