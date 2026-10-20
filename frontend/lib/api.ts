import { authClient } from "@/lib/auth/client";
import { env } from "@/lib/env";
import type {
  ApiError,
  Profile,
  Step1Payload,
  Step2Payload,
  Step3Payload,
  Step4Payload,
} from "@/types/profile";

// Error class carrying HTTP status code and optional per-field validation errors
export class ApiClientError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = error.code;
    this.fields = error.fields;
  }
}

// In-memory cache for the auth token to make consecutive API requests fast
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

// Reads token expiration from JWT payload without an external library
function readTokenExpiry(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1]));
      if (typeof payload.exp === "number") {
        return payload.exp * 1000;
      }
    }
  } catch {
    // If decoding fails, default to a safe 60 second lifetime
  }
  return Date.now() + 60 * 1000;
}

// Retrieves a fresh token using the Neon Auth client or valid in-memory cache
async function getFreshToken(): Promise<string | null> {
  // Use cached token if it is still valid for at least another 30 seconds
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 30_000) {
    return cachedToken;
  }

  // Method 1: authClient.token() as recommended in Neon Auth JWT guide
  try {
    const clientWithToken = authClient as unknown as {
      token?: () => Promise<{ data?: { token?: string } }>;
    };
    if (typeof clientWithToken.token === "function") {
      const tokenRes = await clientWithToken.token();
      if (tokenRes?.data?.token) {
        cachedToken = tokenRes.data.token;
        cachedTokenExpiresAt = readTokenExpiry(cachedToken);
        return cachedToken;
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
      cachedToken = headerToken;
      cachedTokenExpiresAt = readTokenExpiry(cachedToken);
      return cachedToken;
    }
  } catch (err) {
    console.warn("authClient.getSession() fallback error:", err);
  }

  cachedToken = null;
  cachedTokenExpiresAt = 0;
  return null;
}

// Single core API caller function used for all backend communication
export async function apiCall<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getFreshToken();

  // If no token exists, the user session is expired
  if (!token) {
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
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
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

  // Handle 401 Unauthorized: sign out user and redirect to sign in
  if (response.status === 401) {
    cachedToken = null;
    cachedTokenExpiresAt = 0;
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

// Typed convenience helpers for profile and onboarding routes
export async function getProfile(): Promise<Profile> {
  return apiCall<Profile>("/profile", { method: "GET" });
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

