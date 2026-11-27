import { authClient } from "@/lib/auth/client";
import { env } from "@/lib/env";
import { tokenCache } from "@/lib/token-cache";

export interface MeResponse {
  id: string;
  email: string | null;
  name?: string | null;
  is_admin: boolean;
  status: "active" | "suspended" | string;
  onboarding_completed: boolean;
  customization_enabled?: boolean;
}

/**
 * Single shared post-auth routing helper used by every sign-in, sign-up, OAuth,
 * and already-signed-in entry point.
 */
export function getPostAuthRoute(me: MeResponse): string {
  if (me.status === "suspended") {
    return "/auth/sign-in?error=suspended";
  }
  if (me.is_admin) {
    return "/admin";
  }
  if (!me.onboarding_completed) {
    return "/onboarding";
  }
  return "/app";
}

export type FetchMeResult =
  | { ok: true; me: MeResponse }
  | { ok: false; suspended?: boolean; unauthenticated?: boolean };

/**
 * Verifies the active Neon Auth session cookie, fetches a JWT, and calls GET /me once.
 */
export async function fetchMeWithSessionToken(): Promise<FetchMeResult> {
  let jwtToken: string | null = null;
  let hasSessionUser = false;

  try {
    const sessionRes = await fetch("/api/auth/get-session?disableCookieCache=true", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const headerJwt = sessionRes.headers.get("set-auth-jwt");
    if (headerJwt) {
      jwtToken = headerJwt;
    }

    if (sessionRes.ok) {
      const sessionData = await sessionRes.json().catch(() => null);
      if (sessionData?.user) {
        hasSessionUser = true;
      }
    }
  } catch {
    return { ok: false, unauthenticated: true };
  }

  if (!hasSessionUser) {
    return { ok: false, unauthenticated: true };
  }

  if (!jwtToken) {
    try {
      const clientWithToken = authClient as unknown as {
        token?: () => Promise<{ data?: { token?: string } }>;
      };
      if (typeof clientWithToken.token === "function") {
        const tokenRes = await clientWithToken.token();
        if (tokenRes?.data?.token) {
          jwtToken = tokenRes.data.token;
        }
      }
    } catch {
      // Token retrieval failed
    }
  }

  if (!jwtToken) {
    return { ok: false, unauthenticated: true };
  }

  try {
    const baseApiUrl = env.apiUrl.replace(/\/+$/, "");
    const meRes = await fetch(`${baseApiUrl}/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (meRes.status === 403) {
      const errJson = await meRes.json().catch(() => ({}));
      const code = errJson?.error?.code || errJson?.detail?.code || "";
      if (code === "account_suspended" || code === "ACCOUNT_SUSPENDED") {
        return { ok: false, suspended: true };
      }
      return { ok: false };
    }

    if (!meRes.ok) {
      return { ok: false };
    }

    const me = (await meRes.json()) as MeResponse;
    return { ok: true, me };
  } catch {
    return { ok: false };
  }
}

/**
 * Signs out cleanly, clears token/query caches, and sets signed-out sentinel cookie
 * so leftover session cookies do not trigger redirect loops.
 */
export async function performSuspendedSignOut(clearCache?: () => void): Promise<void> {
  tokenCache.clear();
  clearCache?.();
  try {
    await authClient.signOut();
  } catch {
    // Ignore sign-out errors
  }
  if (typeof document !== "undefined") {
    document.cookie = "autopulse_signed_out=true; path=/; max-age=86400; SameSite=Lax";
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
  }
}
