import { authClient } from "./auth/client";
import { env } from "./env";
import { tokenCache } from "./token-cache";
import type { DashboardData } from "../types/dashboard";
import type { AnalyticsDashboardData, AnalyticsRange } from "../types/analytics";
import type { PublicPlansResponse, UserEntitlements } from "../types/plans";
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

// Error class carrying HTTP status code, optional per-field validation errors, retry-after header, and request URL
export class ApiClientError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  retryAfter?: string | null;
  requestUrl?: string;
  isNetworkError?: boolean;
  upgrade_to?: string | null;
  error_category?: string | null;

  constructor(
    status: number,
    error: ApiError,
    retryAfter?: string | null,
    requestUrl?: string,
    isNetworkError?: boolean,
    upgradeTo?: string | null,
    errorCategory?: string | null
  ) {
    super(error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = error.code;
    this.fields = error.fields;
    this.retryAfter = retryAfter ?? null;
    this.requestUrl = requestUrl;
    this.isNetworkError = Boolean(isNetworkError);
    this.upgrade_to = upgradeTo ?? null;
    this.error_category = errorCategory ?? null;
  }
}

// Clears the in-memory cached token on sign out or invalidation
export function clearCachedToken(): void {
  tokenCache.clear();
}

// Lightweight connection/reconnecting indicator for transient auth or backend errors
let _isReconnecting = false;
const _reconnectingListeners = new Set<(reconnecting: boolean) => void>();

export function setReconnecting(value: boolean): void {
  if (_isReconnecting === value) return;
  _isReconnecting = value;
  for (const listener of _reconnectingListeners) {
    try {
      listener(value);
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeReconnecting(listener: (reconnecting: boolean) => void): () => void {
  _reconnectingListeners.add(listener);
  listener(_isReconnecting);
  return () => {
    _reconnectingListeners.delete(listener);
  };
}

type AuthSessionCheckResult = "valid" | "invalid" | "network_error";
let _inFlightSessionCheck: Promise<AuthSessionCheckResult> | null = null;
let _signOutInProgress = false;

// Checks with Neon Auth once whether the session is genuinely invalid.
// Returns "invalid" ONLY when the auth server clearly reports no active session.
// Returns "network_error" on network failures/5xx, or "valid" if a user session exists.
async function checkAuthSessionState(): Promise<AuthSessionCheckResult> {
  if (_inFlightSessionCheck) {
    return _inFlightSessionCheck;
  }

  _inFlightSessionCheck = (async () => {
    try {
      const res = await authClient.getSession({
        query: { disableCookieCache: "true" },
      } as Parameters<typeof authClient.getSession>[0]);
      const errStatus = (res as { error?: { status?: number } })?.error?.status;
      if (typeof errStatus === "number" && errStatus >= 500) {
        return "network_error";
      }
      if (res?.data?.user) {
        return "valid";
      }
      if (errStatus === 401 || (res && !res.error && res.data === null)) {
        return "invalid";
      }
      return "network_error";
    } catch {
      return "network_error";
    } finally {
      _inFlightSessionCheck = null;
    }
  })();

  return _inFlightSessionCheck;
}

async function handleUnauthorizedOrMissingToken(params: {
  reason: "missing_token" | "backend_401";
  url: string;
  status: number;
}): Promise<never> {
  const { reason, url, status } = params;
  clearCachedToken();

  const sessionState = await checkAuthSessionState();
  if (sessionState === "network_error") {
    setReconnecting(true);
    throw new ApiClientError(
      0,
      {
        code: "network_error",
        message: "Unable to reach the authentication server. Try again in a moment.",
      },
      null,
      url,
      true
    );
  }

  if (sessionState === "valid") {
    setReconnecting(false);
    throw new ApiClientError(
      401,
      {
        code: reason === "backend_401" ? "backend_unauthorized" : "token_unavailable",
        message:
          reason === "backend_401"
            ? "The server rejected your session token. Please try again or sign in again."
            : "Could not obtain an API access token. Please try again.",
      },
      null,
      url,
      false
    );
  }

  setReconnecting(false);
  console.info(
    `[AUTH_SIGN_OUT] reason=${reason} code=invalid_session url=${url} status=${status}`
  );

  if (!_signOutInProgress) {
    _signOutInProgress = true;
    try {
      await authClient.signOut();
    } catch {
      // Ignore cleanup error if already signed out
    }
    if (typeof window !== "undefined") {
      try {
        const theme = localStorage.getItem("theme");
        const nextTheme = localStorage.getItem("next-theme");
        localStorage.clear();
        sessionStorage.clear();
        if (theme) localStorage.setItem("theme", theme);
        if (nextTheme) localStorage.setItem("next-theme", nextTheme);
      } catch {
        // Storage access may be restricted
      }
      window.location.replace("/auth/sign-in");
    }
  }

  throw new ApiClientError(
    401,
    {
      code: "unauthorized",
      message: "Your session is no longer valid. Please sign in again.",
    },
    null,
    url,
    false
  );
}

// Retrieves a fresh token using tokenCache manager
// Reuses token until 60 seconds before expiration; shares in-flight requests
export async function getFreshToken(forceRefresh: boolean = false): Promise<string | null> {
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

    // Method 2: Bypass Neon Auth local cookie cache so upstream returns a fresh set-auth-jwt header
    if (typeof window !== "undefined") {
      try {
        const res = await fetch("/api/auth/get-session?disableCookieCache=true", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const jwtHeader = res.headers.get("set-auth-jwt");
        if (jwtHeader) {
          return jwtHeader;
        }
        if (res.ok) {
          const json = (await res.json().catch(() => null)) as {
            session?: { token?: string };
          } | null;
          const bodyToken = json?.session?.token;
          if (bodyToken && bodyToken.split(".").length === 3) {
            return bodyToken;
          }
        }
      } catch (err) {
        console.warn("/api/auth/get-session?disableCookieCache=true fallback error:", err);
      }
    }

    // Method 3: Fallback to authClient.getSession onSuccess header
    try {
      let headerToken: string | null = null;
      await authClient.getSession({
        query: { disableCookieCache: "true" },
        fetchOptions: {
          onSuccess: (ctx: { response?: { headers?: Headers } }) => {
            const jwt = ctx.response?.headers?.get("set-auth-jwt");
            if (jwt) {
              headerToken = jwt;
            }
          },
        },
      } as Parameters<typeof authClient.getSession>[0]);
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

  const baseApiUrl = env.apiUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseApiUrl}${normalizedPath}`;

  // If no token exists, verify with auth server before deciding whether to sign out or reconnect
  if (!token) {
    return handleUnauthorizedOrMissingToken({
      reason: "missing_token",
      url,
      status: 401,
    });
  }

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
    // Real network error or connection failure
    setReconnecting(true);
    throw new ApiClientError(
      0,
      {
        code: "network_error",
        message: "We can't reach the server right now. Try again in a moment.",
      },
      null,
      url,
      true
    );
  }

  // Any HTTP response means the server is reachable
  setReconnecting(false);

  // Handle 401 Unauthorized: clear cached token and retry once
  if (response.status === 401) {
    clearCachedToken();
    if (!isRetry) {
      return apiCall<T>(path, options, true);
    }

    return handleUnauthorizedOrMissingToken({
      reason: "backend_401",
      url,
      status: response.status,
    });
  }

  // Handle 429 Rate Limited with Retry-After header support
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const json = await response.json().catch(() => ({}));
    const errorObj = json?.error || json?.detail || {};
    throw new ApiClientError(
      429,
      {
        code: errorObj.code || "rate_limited",
        message: errorObj.message || "You are generating too fast. Try again in 1 minute.",
      },
      retryAfter || (errorObj.retry_after ? String(errorObj.retry_after) : null),
      url,
      false,
      null,
      errorObj.error_category || "rate_limited"
    );
  }

  // Handle 503 Service Unavailable
  if (response.status === 503) {
    throw new ApiClientError(
      503,
      {
        code: "service_unavailable",
        message: "We can't reach the server right now. Try again in a moment.",
      },
      null,
      url
    );
  }

  // Handle 422 Unprocessable Content with field-level validation messages
  if (response.status === 422) {
    const json = await response.json().catch(() => ({}));
    const errorObj = json?.error || {};
    throw new ApiClientError(
      422,
      {
        code: errorObj.code || "validation_error",
        message: errorObj.message || "Some fields need fixing.",
        fields: errorObj.fields || {},
      },
      null,
      url
    );
  }

  // Handle any other non-2xx response
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    const errorObj = json?.error || {};
    const detailMsg =
      typeof json?.detail === "string"
        ? json.detail
        : typeof json?.detail?.message === "string"
          ? json.detail.message
          : undefined;
    throw new ApiClientError(
      response.status,
      {
        code: errorObj.code || json?.detail?.code || "api_error",
        message: errorObj.message || detailMsg || "An unexpected error occurred.",
      },
      null,
      url,
      false,
      errorObj.upgrade_to ?? json?.detail?.upgrade_to ?? null,
      errorObj.error_category ?? json?.detail?.error_category ?? null
    );
  }

  // Handle 204 No Content responses which carry an empty body
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}

export async function getPublicPlans(): Promise<PublicPlansResponse> {
  const baseApiUrl = env.apiUrl.replace(/\/+$/, "");
  const res = await fetch(`${baseApiUrl}/api/plans`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load plans");
  }
  return (await res.json()) as PublicPlansResponse;
}

export async function getMyEntitlements(): Promise<UserEntitlements> {
  return apiCall<UserEntitlements>("/api/me/entitlements", { method: "GET" });
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

// Permanently delete the signed-in user's account using the token identity only
export async function deleteAccount(): Promise<void> {
  return apiCall<void>("/account", {
    method: "DELETE",
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

  const baseApiUrl = env.apiUrl.replace(/\/+$/, "");
  const url = `${baseApiUrl}/posts/${id}/image.png?w=${width}`;

  if (!token) {
    return handleUnauthorizedOrMissingToken({
      reason: "missing_token",
      url,
      status: 401,
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    setReconnecting(true);
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
    return handleUnauthorizedOrMissingToken({
      reason: "backend_401",
      url,
      status: response.status,
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

export interface RunEventItem {
  seq: number;
  time: string;
  elapsed_ms?: number | null;
  type: string;
  agent?: string | null;
  status?: string | null;
  message: string;
  payload: Record<string, any>;
}

export interface RunEventsResponse {
  run_id: string;
  status: string;
  events: RunEventItem[];
  last_seq: number;
}

// Fetches incremental public timeline events for a playground run after afterSeq
export async function getPlaygroundRunEvents(
  runId: string,
  afterSeq: number = 0
): Promise<RunEventsResponse> {
  return apiCall<RunEventsResponse>(`/playground/runs/${runId}/events?after_seq=${afterSeq}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store",
      "Pragma": "no-cache",
    },
  });
}

// Requests cancellation of an active playground run
export async function cancelPlaygroundRun(
  runId: string
): Promise<{ run_id: string; status: string; best_draft?: Record<string, any> | null }> {
  return apiCall(`/playground/runs/${runId}/cancel`, {
    method: "POST",
    cache: "no-store",
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




