import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { createAuthServer, extractNeonAuthCookies } from "@neondatabase/auth/server";
import { cookies, headers } from "next/headers";
import { getServerEnv } from "@/lib/env";

const { NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET } = getServerEnv();

// Safe Next.js request context:
// In Next.js Server Components, cookies() is read-only.
// When an unauthenticated or expired session check occurs, upstream Neon Auth
// sends Set-Cookie headers to clear cookies. Calling cookieStore.set() inside a
// Server Component throws:
// "Error: Cookies can only be modified in a Server Action or Route Handler"
// This context catches and safely suppresses cookie modification errors when in Server Components,
// while preserving cookie modification in Server Actions and Route Handlers.
async function createSafeNextRequestContext() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return {
    getCookies() {
      return extractNeonAuthCookies(headerStore);
    },
    setCookie(name: string, value: string, options: any) {
      try {
        cookieStore.set(name, value, options);
      } catch {
        // In Next.js Server Components, cookies cannot be modified.
        // Safely ignore during read-only Server Component rendering.
      }
    },
    getHeader(name: string) {
      return headerStore.get(name) ?? null;
    },
    getOrigin() {
      return (
        headerStore.get("origin") ||
        headerStore.get("referer")?.split("/").slice(0, 3).join("/") ||
        ""
      );
    },
    getFramework() {
      return "nextjs" as const;
    },
  };
}

// Base server-side auth instance using Neon Auth
const baseAuth = createNeonAuth({
  baseUrl: NEON_AUTH_BASE_URL,
  cookies: {
    secret: NEON_AUTH_COOKIE_SECRET,
  },
});

// Safe server instance for getSession with Server Component safe cookie handling
const safeServer = createAuthServer({
  baseUrl: NEON_AUTH_BASE_URL,
  context: createSafeNextRequestContext,
  cookieSecret: NEON_AUTH_COOKIE_SECRET,
});

export const auth: NeonAuth = new Proxy(baseAuth, {
  get(target, prop, receiver) {
    if (prop === "getSession") {
      return safeServer.getSession;
    }
    return Reflect.get(target, prop, receiver);
  },
}) as NeonAuth;
