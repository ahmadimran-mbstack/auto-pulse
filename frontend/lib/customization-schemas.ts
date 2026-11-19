import { z } from "zod";

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".md", ".markdown", ".txt"] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function validateCustomizationFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!hasValidExt) {
    return "Unsupported file type. Upload a PDF, DOCX, Markdown, or TXT file.";
  }
  if (file.size <= 0) {
    return "File is empty.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "File exceeds the 10 MB limit.";
  }
  return null;
}

export const urlAddSchema = z.object({
  url: z
    .string()
    .trim()
    .min(8, "Enter a full URL starting with https://")
    .max(2048, "URL is too long")
    .refine((val) => /^https?:\/\//i.test(val), "URL must start with http:// or https://"),
  title: z.string().trim().max(120, "Title must be 120 characters or less").optional(),
});

export type UrlAddValues = z.infer<typeof urlAddSchema>;

export const pastePostsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or less"),
  text: z
    .string()
    .trim()
    .min(10, "Paste at least 10 characters")
    .max(30000, "Paste is limited to 30,000 characters"),
});

export type PastePostsValues = z.infer<typeof pastePostsSchema>;

export const instructionsSchema = z.object({
  custom_instructions: z
    .string()
    .max(4000, "Custom instructions must be 4,000 characters or less"),
});

export type InstructionsValues = z.infer<typeof instructionsSchema>;
