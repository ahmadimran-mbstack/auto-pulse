import { describe, it, expect } from "vitest";
import { sanitizeTags, parseTagInput } from "./tags";

describe("tag sanitization and parsing", () => {
  it("trims whitespace from tags", () => {
    const input = ["  AI Agents  ", " Next.js "];
    expect(sanitizeTags(input)).toEqual(["AI Agents", "Next.js"]);
  });

  it("drops empty or whitespace-only tags", () => {
    const input = ["React", "", "   ", "TypeScript"];
    expect(sanitizeTags(input)).toEqual(["React", "TypeScript"]);
  });

  it("removes duplicate tags ignoring case while preserving original casing", () => {
    const input = ["Python", "python", "PYTHON", "Data Science"];
    expect(sanitizeTags(input)).toEqual(["Python", "Data Science"]);
  });

  it("caps each tag length at 40 characters", () => {
    const longTag = "a".repeat(50);
    const result = sanitizeTags([longTag]);
    expect(result[0].length).toBe(40);
  });

  it("limits the total number of tags to 10", () => {
    const twelveTags = Array.from({ length: 12 }, (_, i) => `Topic ${i + 1}`);
    const result = sanitizeTags(twelveTags);
    expect(result.length).toBe(10);
    expect(result[0]).toBe("Topic 1");
    expect(result[9]).toBe("Topic 10");
  });

  it("parses comma-separated tag strings", () => {
    const raw = "AI, Engineering, ai, , Cloud Computing";
    expect(parseTagInput(raw)).toEqual(["AI", "Engineering", "Cloud Computing"]);
  });
});
