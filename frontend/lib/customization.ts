import { apiCall, getFreshToken } from "@/lib/api";
import { env } from "@/lib/env";
import type {
  CompiledContextView,
  CustomizationOverview,
  CustomizationSettingsView,
  DocumentDetail,
  DocumentKind,
  DocumentSummary,
  PostSampleView,
  VersionSummary,
} from "@/types/customization";

export const customizationKeys = {
  all: ["customization"] as const,
  overview: () => ["customization", "overview"] as const,
  documents: (kind?: DocumentKind) => ["customization", "documents", kind ?? "all"] as const,
  document: (id: string) => ["customization", "document", id] as const,
  context: () => ["customization", "context"] as const,
  versions: () => ["customization", "versions"] as const,
};

export const PROCESSING_STATUSES = new Set(["uploaded", "extracting", "distilling", "embedding"]);

export function getDocumentsPollingInterval(docs?: DocumentSummary[]): number | false {
  if (!docs || docs.length === 0) return false;
  return docs.some((d) => PROCESSING_STATUSES.has(d.status)) ? 2000 : false;
}

export const CUSTOMIZATION_ERROR_COPY: Record<string, string> = {
  unsupported_type: "Unsupported file format. Please upload PDF, DOCX, Markdown, or TXT.",
  file_too_large: "File exceeds the 10 MB limit.",
  quota_exceeded: "You have reached the item or storage limit for this section.",
  rate_limited: "Too many uploads. Please wait a bit before trying again.",
  encrypted_pdf: "This PDF is password-protected. Export an unencrypted copy and retry.",
  no_text_layer: "This PDF looks scanned or image-only. Export it with selectable text.",
  empty_document: "No readable text was found in this document.",
  too_many_pages: "PDF exceeds the 150-page limit.",
  zip_bomb: "The DOCX archive could not be safely unpacked.",
  macro_document: "Macro-enabled Word documents (.docm) are not allowed.",
  decode_failed: "Could not read text encoding. Save as UTF-8 and retry.",
  url_blocked: "This URL is blocked for security reasons.",
  url_unreachable: "Could not reach this URL. Check that it is publicly accessible.",
  url_robots_disallowed: "This site's robots.txt blocks automated reading.",
  url_unsupported_content: "This URL does not return HTML, text, or PDF content.",
  distill_failed: "Could not extract structured insights. Click Retry.",
  timeout: "Processing timed out. Click Retry.",
};

export function formatCustomizationError(code?: string | null, fallback?: string | null): string {
  if (code && CUSTOMIZATION_ERROR_COPY[code]) return CUSTOMIZATION_ERROR_COPY[code];
  return fallback || "Processing failed. Please try again.";
}

export async function getCustomizationOverview(): Promise<CustomizationOverview> {
  return apiCall<CustomizationOverview>("/customization");
}

export async function listCustomizationDocuments(kind?: DocumentKind): Promise<DocumentSummary[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return apiCall<DocumentSummary[]>(`/customization/documents${qs}`);
}

export async function uploadCustomizationDocument(
  file: File,
  kind: DocumentKind,
  title?: string
): Promise<DocumentSummary> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  if (title) form.append("title", title);
  return apiCall<DocumentSummary>("/customization/documents", {
    method: "POST",
    body: form,
  });
}

export async function uploadCustomizationDocumentWithProgress(
  file: File,
  kind: DocumentKind,
  onProgress: (percent: number) => void,
  title?: string
): Promise<DocumentSummary> {
  const token = await getFreshToken();
  if (!token) {
    throw new Error("Your session is no longer valid. Please sign in again.");
  }
  const baseApiUrl = env.apiUrl.replace(/\/+$/, "");
  const url = `${baseApiUrl}/customization/documents`;
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  if (title) form.append("title", title);

  return new Promise<DocumentSummary>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(parsed as DocumentSummary);
        } else {
          const msg =
            parsed?.detail?.message || parsed?.message || `Upload failed (HTTP ${xhr.status})`;
          reject(new Error(msg));
        }
      } catch {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error while uploading file."));
    xhr.send(form);
  });
}

export async function pasteCustomizationDocument(payload: {
  kind: DocumentKind;
  title: string;
  text: string;
}): Promise<DocumentSummary> {
  return apiCall<DocumentSummary>("/customization/documents/paste", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function addBusinessUrl(payload: {
  url: string;
  title?: string;
}): Promise<DocumentSummary> {
  return apiCall<DocumentSummary>("/customization/urls", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCustomizationDocument(id: string): Promise<DocumentDetail> {
  return apiCall<DocumentDetail>(`/customization/documents/${encodeURIComponent(id)}`);
}

export async function patchCustomizationDocument(
  id: string,
  payload: { title?: string; enabled?: boolean }
): Promise<DocumentSummary> {
  return apiCall<DocumentSummary>(`/customization/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function reprocessCustomizationDocument(id: string): Promise<DocumentSummary> {
  return apiCall<DocumentSummary>(`/customization/documents/${encodeURIComponent(id)}/reprocess`, {
    method: "POST",
  });
}

export async function deleteCustomizationDocument(id: string): Promise<void> {
  return apiCall<void>(`/customization/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function patchPostSample(
  id: string,
  payload: { pinned?: boolean; excluded?: boolean }
): Promise<PostSampleView> {
  return apiCall<PostSampleView>(`/customization/samples/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateCustomizationSettings(payload: {
  custom_instructions?: string;
  default_playbook_mode?: "merge" | "replace";
  use_previous_posts_for_voice?: boolean;
  business_mention?: "never" | "natural" | "often";
}): Promise<CustomizationSettingsView> {
  return apiCall<CustomizationSettingsView>("/customization/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getCompiledContext(): Promise<CompiledContextView> {
  return apiCall<CompiledContextView>("/customization/context");
}

export async function patchContextOverrides(payload: {
  disabled_rule_ids?: string[];
  voice_summary_override?: string | null;
  removed_fact_ids?: string[];
  policy_overrides?: Record<string, unknown>;
}): Promise<CompiledContextView> {
  return apiCall<CompiledContextView>("/customization/context/overrides", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function triggerCustomizationCompile(): Promise<{ status: string }> {
  return apiCall<{ status: string }>("/customization/compile", { method: "POST" });
}

export async function listCustomizationVersions(): Promise<VersionSummary[]> {
  return apiCall<VersionSummary[]>("/customization/versions");
}

export async function activateCustomizationVersion(id: string): Promise<CompiledContextView> {
  return apiCall<CompiledContextView>(`/customization/versions/${encodeURIComponent(id)}/activate`, {
    method: "POST",
  });
}
