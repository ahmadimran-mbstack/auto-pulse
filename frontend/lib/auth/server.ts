import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getServerEnv } from "@/lib/env";

const { NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET } = getServerEnv();

// Server-side auth instance using Neon Auth
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export const auth = createNeonAuth({
  baseUrl: NEON_AUTH_BASE_URL,
  cookies: {
    secret: NEON_AUTH_COOKIE_SECRET,
  },
});
