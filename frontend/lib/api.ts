import { authClient } from "./auth/client";
import { env } from "./env";
import { tokenCache } from "./token-cache";
import type { DashboardData } from "../types/dashboard";
import type { AnalyticsDashboardData, AnalyticsRange } from "../types/analytics";
import type {
  ApiError,
  Profile,
  PatchProfilePayload,
  Step1Payload,
  Step2Payload,
  Step3Payload,
  Step4Payload,
} from "../types/profile";
import type {
  GetPostsParams,
  PaginatedPosts,
  PostDetail,
  PostListItem,
  PostSchedule,
  AgentTrace,
  RunResponse,
} from "../types/posts";

// Error class carrying HTTP status code, optional per-field validation errors, and retry-after header
export class ApiClientError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  retryAfter?: string | null;

  constructor(status: number, error: ApiError, retryAfter?: string | null) {
    super(error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = error.code;
    this.fields = error.fields;
    this.retryAfter = retryAfter ?? null;
  }
}

// Clears the in-memory cached token on sign out or invalidation
export function clearCachedToken(): void {
  tokenCache.clear();
}

// Retrieves a fresh token using tokenCache manager
// Reuses token until 60 seconds before expiration; shares in-flight requests
async function getFreshToken(forceRefresh: boolean = false): Promise<string | null> {
  return tokenCache.getToken(async () => {
    // Method 1: authClient.token() as recommended in Neon Auth JWT guide
    try {
      const clientWithToken = authClient as unknown as {
        token?: () => Promise<{ data?: { token?: string } }>;
      };
      if (typeof clientWithToken.token === "function") {
        const tokenRes = await clientWithToken.token();
        if (tokenRes?.data?.token) {
          return tokenRes.data.token;
        }
      }
    } catch (err) {
      console.warn("authClient.token() error:", err);
    }

    // Method 2: Fallback to reading set-auth-jwt response header from getSession
    try {
      let headerToken: string | null = null;
      await authClient.getSession({
        fetchOptions: {
          onSuccess: (ctx: { response?: { headers?: Headers } }) => {
            const jwt = ctx.response?.headers?.get("set-auth-jwt");
            if (jwt) {
              headerToken = jwt;
            }
          },
        },
      });
      if (headerToken) {
        return headerToken;
      }
    } catch (err) {
      console.warn("authClient.getSession() fallback error:", err);
    }

    return null;
  }, forceRefresh);
}

// Single core API caller function used for all backend communication
export async function apiCall<T>(
  path: string,
  options: RequestInit = {},
  isRetry: boolean = false
): Promise<T> {
  const token = await getFreshToken(isRetry);

  // If no token exists, the user session is expired
  if (!token) {
    clearCachedToken();
    try {
      await authClient.signOut();
    } catch {
      // Ignore cleanup error if already signed out
    }
    if (typeof window !== "undefined") {
      // Hard redirect to sign-in on session invalidation outside React lifecycle
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/auth/sign-in";
    }
    throw new ApiClientError(401, {
      code: "unauthorized",
      message: "Your session is no longer valid. Please sign in again.",
    });
  }

  const url = `${env.apiUrl}${path}`;
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  // Do not set Content-Type header when sending FormData so the browser sets the boundary automatically
  if (
    !headers.has("Content-Type") &&
    options.body &&
    !(typeof FormData !== "undefined" && options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }


  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...options,
      headers,
    });
  } catch {
    // Network errors or connection failures
    throw new ApiClientError(503, {
      code: "service_unavailable",
      message: "We can't reach the server right now. Try again in a moment.",
    });
  }

  // Handle 401 Unauthorized: clear cached token and retry once
  if (response.status === 401) {
    clearCachedToken();
    if (!isRetry) {
      return apiCall<T>(path, options, true);
    }

    try {
      await authClient.signOut();
    } catch {
      // Ignore cleanup error
    }
    if (typeof window !== "undefined") {
      // Hard redirect to sign-in on session invalidation outside React lifecycle
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/auth/sign-in";
    }
    throw new ApiClientError(401, {
      code: "unauthorized",
      message: "Your session is no longer valid. Please sign in again.",
    });
  }

  // Handle 429 Rate Limited with Retry-After header support
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const json = await response.json().catch(() => ({}));
    const errorObj = json?.error || {};
    throw new ApiClientError(
      429,
      {
        code: errorObj.code || "rate_limited",
        message: errorObj.message || "Too many requests. Please try again in a moment.",
      },
      retryAfter
    );
  }

  // Handle 503 Service Unavailable
  if (response.status === 503) {
    throw new ApiClientError(503, {
      code: "service_unavailable",
      message: "We can't reach the server right now. Try again in a moment.",
    });
  }

  // Handle 422 Unprocessable Content with field-level validation messages
  if (response.status === 422) {
    const json = await response.json().catch(() => ({}));
    const errorObj = json?.error || {};
    throw new ApiClientError(422, {
      code: errorObj.code || "validation_error",
      message: errorObj.message || "Some fields need fixing.",
      fields: errorObj.fields || {},
    });
  }

  // Handle any other non-2xx response
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    const errorObj = json?.error || {};
    throw new ApiClientError(response.status, {
      code: errorObj.code || "api_error",
      message: errorObj.message || "An unexpected error occurred.",
    });
  }

  // Handle 204 No Content responses which carry an empty body
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}

// Typed convenience helper for dashboard overview route
export async function getDashboard(): Promise<DashboardData> {
  return apiCall<DashboardData>("/dashboard", { method: "GET" });
}

// Typed convenience helpers for profile and onboarding routes
export async function getProfile(): Promise<Profile> {
  return apiCall<Profile>("/profile", { method: "GET" });
}

export async function patchProfile(payload: PatchProfilePayload): Promise<Profile> {
  return apiCall<Profile>("/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAccount(confirm: "DELETE" = "DELETE"): Promise<void> {
  return apiCall<void>("/account", {
    method: "DELETE",
    body: JSON.stringify({ confirm }),
  });
}

export async function saveStep1(payload: Step1Payload): Promise<Profile> {
  return apiCall<Profile>("/profile/onboarding/1", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function saveStep2(payload: Step2Payload): Promise<Profile> {
  return apiCall<Profile>("/profile/onboarding/2", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function saveStep3(payload: Step3Payload): Promise<Profile> {
  return apiCall<Profile>("/profile/onboarding/3", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function saveStep4(payload: Step4Payload): Promise<Profile> {
  return apiCall<Profile>("/profile/onboarding/4", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function completeOnboarding(): Promise<Profile> {
  return apiCall<Profile>("/profile/onboarding/complete", {
    method: "POST",
  });
}

// Typed helpers for social account connections
export async function getConnections(): Promise<import("@/types/connections").SocialConnection[]> {
  return apiCall<import("@/types/connections").SocialConnection[]>("/connections", {
    method: "GET",
  });
}

export async function startLinkedInConnection(): Promise<import("@/types/connections").OAuthStartResponse> {
  return apiCall<import("@/types/connections").OAuthStartResponse>(
    "/connections/linkedin/start",
    {
      method: "POST",
    }
  );
}

export async function callbackLinkedInConnection(
  payload: import("@/types/connections").OAuthCallbackPayload
): Promise<import("@/types/connections").SocialConnection> {
  return apiCall<import("@/types/connections").SocialConnection>(
    "/connections/linkedin/callback",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function disconnectLinkedInConnection(): Promise<void> {
  return apiCall<void>("/connections/linkedin", {
    method: "DELETE",
  });
}

// Typed helpers for post drafts, generation, and schedules
export async function getPosts(
  paramsOrLimit: number | GetPostsParams = 10
): Promise<PaginatedPosts> {
  const query = new URLSearchParams();
  if (typeof paramsOrLimit === "number") {
    query.set("limit", String(paramsOrLimit));
  } else if (paramsOrLimit) {
    if (paramsOrLimit.limit) query.set("limit", String(paramsOrLimit.limit));
    if (paramsOrLimit.cursor) query.set("cursor", paramsOrLimit.cursor);
    if (paramsOrLimit.status) query.set("status", paramsOrLimit.status);
  }
  const queryString = query.toString();
  const url = queryString ? `/posts?${queryString}` : "/posts";

  const res = await apiCall<PaginatedPosts | PostListItem[]>(url, {
    method: "GET",
  });

  // Backward compatibility: handle both { items, next_cursor } and legacy array
  if (Array.isArray(res)) {
    return { items: res, next_cursor: null };
  }
  return {
    items: res?.items || [],
    next_cursor: res?.next_cursor ?? null,
  };
}

export async function getPost(id: string): Promise<PostDetail> {
  return apiCall<PostDetail>(`/posts/${id}`, {
    method: "GET",
  });
}

export async function getPostSchedule(): Promise<PostSchedule> {
  return apiCall<PostSchedule>("/posts/schedule", {
    method: "GET",
  });
}

export async function generateDraft(replace: boolean = true): Promise<PostDetail> {
  return apiCall<PostDetail>(`/posts/generate?replace=${replace}`, {
    method: "POST",
  });
}
export const generateDraftNow = generateDraft;

// Fetches the post branded image as a raw Blob using fresh Bearer authentication
export async function fetchPostImageBlob(
  id: string,
  width: 240 | 480 | 1200 = 480,
  isRetry: boolean = false
): Promise<Blob> {
  const token = await getFreshToken(isRetry);

  if (!token) {
    clearCachedToken();
    try {
      await authClient.signOut();
    } catch {
      // Ignore cleanup error if already signed out
    }
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/auth/sign-in";
    }
    throw new ApiClientError(401, {
      code: "unauthorized",
      message: "Your session is no longer valid. Please sign in again.",
    });
  }

  const url = `${env.apiUrl}/posts/${id}/image.png?w=${width}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiClientError(503, {
      code: "service_unavailable",
      message: "We can't reach the server right now. Try again in a moment.",
    });
  }

  if (response.status === 401) {
    clearCachedToken();
    if (!isRetry) {
      return fetchPostImageBlob(id, width, true);
    }
    try {
      await authClient.signOut();
    } catch {
      // Ignore cleanup error
    }
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/auth/sign-in";
    }
    throw new ApiClientError(401, {
      code: "unauthorized",
      message: "Your session is no longer valid. Please sign in again.",
    });
  }

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    const errorObj = json?.error || {};
    throw new ApiClientError(response.status, {
      code: errorObj.code || "image_error",
      message: errorObj.message || "Failed to load image.",
    });
  }

  return await response.blob();
}

// Submits a user decision (approved or rejected) for a draft post
export async function submitPostDecision(
  id: string,
  decision: "approved" | "rejected"
): Promise<{ status: string; decision: string }> {
  return apiCall<{ status: string; decision: string }>(`/posts/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

// Retries publishing a failed post with optional confirmation for unknown outcomes
export async function retryPostPublication(
  id: string,
  confirmNotPosted: boolean = false
): Promise<{ status: string }> {
  return apiCall<{ status: string }>(`/posts/${id}/publications/linkedin/retry`, {
    method: "POST",
    body: JSON.stringify({ confirm_not_posted: confirmNotPosted }),
  });
}

// Fetches the caller's LinkedIn account connection status
export async function getLinkedInStatus(): Promise<import("@/types/connections").LinkedInStatusResponse> {
  return apiCall<import("@/types/connections").LinkedInStatusResponse>("/api/linkedin/status", {
    method: "GET",
  });
}

// Publishes a post and optional image immediately to LinkedIn
export async function postToLinkedIn(
  formData: FormData
): Promise<import("@/types/connections").LinkedInPostResponse> {
  return apiCall<import("@/types/connections").LinkedInPostResponse>("/api/linkedin/post", {
    method: "POST",
    body: formData,
  });
}

// Fetches current Slack integration status
export async function getSlackStatus(): Promise<import("@/types/connections").SlackStatusResponse> {
  return apiCall<import("@/types/connections").SlackStatusResponse>("/integrations/slack/status", {
    method: "GET",
  });
}

// Initiates Slack OAuth connection
export async function connectSlack(
  payload: import("@/types/connections").SlackConnectPayload = { return_to: "dashboard" }
): Promise<import("@/types/connections").SlackConnectResponse> {
  return apiCall<import("@/types/connections").SlackConnectResponse>("/integrations/slack/connect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Sends a test Slack direct message
export async function testSlack(): Promise<import("@/types/connections").SlackTestResponse> {
  return apiCall<import("@/types/connections").SlackTestResponse>("/integrations/slack/test", {
    method: "POST",
  });
}

// Disconnects Slack integration
export async function disconnectSlack(): Promise<import("@/types/connections").SlackDisconnectResponse> {
  return apiCall<import("@/types/connections").SlackDisconnectResponse>("/integrations/slack", {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Writing Agents API Endpoints
// ---------------------------------------------------------------------------

// Enqueues an experimental playground run with writing agents (always uncached)
export async function createPlaygroundRun(topicHint?: string): Promise<{ run_id: string; status?: string }> {
  return apiCall<{ run_id: string; status?: string }>("/playground/runs", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Pragma": "no-cache",
    },
    body: JSON.stringify(topicHint ? { topic_hint: topicHint } : {}),
  });
}

// Retrieves status, step, round, and audit trace for a run (daily or playground) (always uncached)
export async function getRun(runId: string): Promise<RunResponse> {
  const data = await apiCall<RunResponse & { agent_trace?: AgentTrace | null }>(`/runs/${runId}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Pragma": "no-cache",
    },
  });
  if (!data.trace && data.agent_trace) {
    data.trace = data.agent_trace;
  }
  return data;
}

// Fetches multi-agent audit trace for an existing post (null for legacy posts)
export async function getPostAgentTrace(postId: string): Promise<{ trace: AgentTrace | null }> {
  const data = await apiCall<{ trace?: AgentTrace | null; agent_trace?: AgentTrace | null }>(
    `/posts/${postId}/agent-trace`,
    {
      method: "GET",
    }
  );
  return {
    trace: data.trace ?? data.agent_trace ?? null,
  };
}

// ---------------------------------------------------------------------------
// Analytics API Endpoints
// ---------------------------------------------------------------------------

// Fetches SQL-aggregated analytics for the signed-in user and range (7d, 30d, 90d)
export async function getAnalytics(
  range: AnalyticsRange = "30d"
): Promise<AnalyticsDashboardData> {
  return apiCall<AnalyticsDashboardData>(
    `/analytics?range=${encodeURIComponent(range)}`,
    {
      method: "GET",
    }
  );
}




