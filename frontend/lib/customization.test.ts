import { describe, it, expect } from "vitest";
import {
  formatCustomizationError,
  getDocumentsPollingInterval,
} from "./customization";
import {
  urlAddSchema,
  pastePostsSchema,
  instructionsSchema,
  validateCustomizationFile,
} from "./customization-schemas";
import type { DocumentSummary } from "@/types/customization";

describe("customization helpers", () => {
  it("polls every 2s only while documents are processing", () => {
    const readyDoc = { id: "1", status: "ready" } as DocumentSummary;
    const distillingDoc = { id: "2", status: "distilling" } as DocumentSummary;
    expect(getDocumentsPollingInterval([])).toBe(false);
    expect(getDocumentsPollingInterval([readyDoc])).toBe(false);
    expect(getDocumentsPollingInterval([readyDoc, distillingDoc])).toBe(2000);
  });

  it("maps error codes to user-friendly messages", () => {
    expect(formatCustomizationError("encrypted_pdf")).toContain("password-protected");
    expect(formatCustomizationError("unknown_code", "Custom fallback")).toBe("Custom fallback");
  });

  it("validates URL, paste, and instruction schemas", () => {
    expect(urlAddSchema.safeParse({ url: "https://example.com" }).success).toBe(true);
    expect(urlAddSchema.safeParse({ url: "ftp://example.com" }).success).toBe(false);
    expect(pastePostsSchema.safeParse({ title: "Posts", text: "Too short" }).success).toBe(false);
    expect(instructionsSchema.safeParse({ custom_instructions: "Keep it brief." }).success).toBe(true);
  });

  it("validates file extension and size client-side", () => {
    const ok = new File(["hello"], "playbook.md", { type: "text/markdown" });
    expect(validateCustomizationFile(ok)).toBeNull();

    const badExt = new File(["hello"], "malware.exe", { type: "application/octet-stream" });
    expect(validateCustomizationFile(badExt)).toContain("Unsupported file type");
  });
});
