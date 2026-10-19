// Helper functions to read and validate environment variables
// Prevents missing configuration from failing silently at runtime

// Server-only environment variables
export function getServerEnv() {
  const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL;
  const NEON_AUTH_COOKIE_SECRET = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!NEON_AUTH_BASE_URL) {
    throw new Error("Missing required server environment variable: NEON_AUTH_BASE_URL");
  }
  if (!NEON_AUTH_COOKIE_SECRET) {
    throw new Error("Missing required server environment variable: NEON_AUTH_COOKIE_SECRET");
  }
  if (NEON_AUTH_COOKIE_SECRET.length < 32) {
    throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters long");
  }

  return {
    NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET,
  };
}

// Client-accessible environment variables
// Must read literally as process.env.NEXT_PUBLIC_* so Next.js embeds them in client bundles
export const env = {
  get apiUrl(): string {
    const value = process.env.NEXT_PUBLIC_API_URL;
    if (!value) {
      throw new Error("Missing required public environment variable: NEXT_PUBLIC_API_URL");
    }
    return value;
  },
  get siteUrl(): string {
    const value = process.env.NEXT_PUBLIC_SITE_URL;
    if (!value) {
      throw new Error("Missing required public environment variable: NEXT_PUBLIC_SITE_URL");
    }
    return value;
  },
  get contactEmail(): string {
    const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
    if (!value) {
      throw new Error("Missing required public environment variable: NEXT_PUBLIC_CONTACT_EMAIL");
    }
    return value;
  },
  get companyName(): string {
    const value = process.env.NEXT_PUBLIC_COMPANY_NAME;
    if (!value) {
      throw new Error("Missing required public environment variable: NEXT_PUBLIC_COMPANY_NAME");
    }
    return value;
  },
};
