import { apiCall } from "@/lib/api";
import type { TestLabCreatePayload, TestLabRun, TestLabStatus } from "./types";

export const testLabKeys = {
  all: ["test-lab"] as const,
  status: () => ["test-lab", "status"] as const,
};

export async function getTestLabStatus(): Promise<TestLabStatus> {
  return apiCall<TestLabStatus>("/test-lab/status");
}

export async function createTestLabRun(payload: TestLabCreatePayload): Promise<TestLabRun> {
  return apiCall<TestLabRun>("/test-lab/runs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelTestLabRun(runId: string): Promise<TestLabRun> {
  return apiCall<TestLabRun>(`/test-lab/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
}

export async function resetTestLabRun(runId: string): Promise<void> {
  return apiCall<void>(`/test-lab/runs/${encodeURIComponent(runId)}`, {
    method: "DELETE",
  });
}

export async function retryTestLabGenerate(runId: string): Promise<TestLabRun> {
  return apiCall<TestLabRun>(`/test-lab/runs/${encodeURIComponent(runId)}/retry-generate`, {
    method: "POST",
  });
}
