import { authClient } from "@/lib/auth/client";
import { env } from "@/lib/env";

export interface PostAuthResult {
  ok: boolean;
  destination: string;
}

/**
 * Verifies that the browser has an active Neon Auth session cookie after login/OTP,
 * then checks admin status without triggering destructive sign-out side effects.
 */
export async function resolvePostAuthDestination(
  fallbackPath: string = "/app"
): Promise<PostAuthResult> {
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
  } catch (err) {
    console.error("[auth] Failed to verify session after sign-in:", err);
  }

  if (!hasSessionUser) {
    return { ok: false, destination: fallbackPath };
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
    } catch (err) {
      console.warn("[auth] authClient.token() failed during post-auth check:", err);
    }
  }

  if (jwtToken) {
    try {
      const baseApiUrl = env.apiUrl.replace(/\/+$/, "");
      const adminRes = await fetch(`${baseApiUrl}/api/admin/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });

      if (adminRes.ok) {
        const data = (await adminRes.json().catch(() => null)) as {
          is_admin?: boolean;
        } | null;
        if (data?.is_admin) {
          return { ok: true, destination: "/admin" };
        }
      }
    } catch (err) {
      console.warn("[auth] Admin status check failed, using fallback route:", err);
    }
  }

  return { ok: true, destination: fallbackPath };
}
