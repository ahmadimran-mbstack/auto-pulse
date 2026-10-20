import { describe, it, expect } from "vitest";
import {
  parseHexColor,
  getContrastRatio,
  getRecommendedTextColor,
  hasAccessibleContrast,
} from "./contrast";

describe("contrast calculation", () => {
  it("parses valid 6-digit hex strings", () => {
    expect(parseHexColor("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor("#0B7F70")).toEqual({ r: 11, g: 127, b: 112 });
  });

  it("returns null for invalid hex strings", () => {
    expect(parseHexColor("red")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
    expect(parseHexColor("")).toBeNull();
  });

  it("calculates contrast ratio between black and white as 21:1", () => {
    const ratio = getContrastRatio("#000000", "#FFFFFF");
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("calculates contrast ratio of a color with itself as 1:1", () => {
    const ratio = getContrastRatio("#0B7F70", "#0B7F70");
    expect(ratio).toBeCloseTo(1, 1);
  });

  it("picks white text on dark brand colors", () => {
    expect(getRecommendedTextColor("#0B7F70")).toBe("#FFFFFF");
    expect(getRecommendedTextColor("#000000")).toBe("#FFFFFF");
    expect(getRecommendedTextColor("#1E293B")).toBe("#FFFFFF");
  });

  it("picks dark ink text on light brand colors", () => {
    expect(getRecommendedTextColor("#FFFFFF")).toBe("#0F172A");
    expect(getRecommendedTextColor("#F8FAFC")).toBe("#0F172A");
    expect(getRecommendedTextColor("#FDF6E2")).toBe("#0F172A");
  });

  it("evaluates WCAG AA accessible contrast correctly", () => {
    // High contrast pairs pass
    expect(hasAccessibleContrast("#000000")).toBe(true);
    expect(hasAccessibleContrast("#FFFFFF")).toBe(true);
    expect(hasAccessibleContrast("#0B7F70")).toBe(true);

    // Low-contrast mid-tone gray whose ratio is below 4.5 with both white and dark ink
    expect(hasAccessibleContrast("#7A7A7A")).toBe(false);
  });
});
