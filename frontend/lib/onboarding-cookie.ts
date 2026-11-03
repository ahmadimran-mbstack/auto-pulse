// Cryptographic helper to sign and verify onboarding completion cookies
// Avoids database roundtrips on every page navigation while keeping security high
import crypto from "crypto";

export const ONBOARDING_COMPLETED_COOKIE = "autopulse_onboarding_completed";

// Returns the cookie secret from environment or falls back safely in dev
function getSecret(): string {
  return process.env.NEON_AUTH_COOKIE_SECRET || "autopulse-default-cookie-secret-min-32-chars-long";
}

// Creates an HMAC-SHA256 signature for the user ID
function signUserId(userId: string): string {
  return crypto.createHmac("sha256", getSecret()).update(userId).digest("hex");
}

// Generates the cookie value containing user ID and signature
export function createOnboardingCookieValue(userId: string): string {
  const signature = signUserId(userId);
  return `${userId}.${signature}`;
}

// Validates the cookie value against the user ID
export function verifyOnboardingCookie(userId: string, cookieValue?: string | null): boolean {
  if (!cookieValue || !userId) return false;

  const parts = cookieValue.split(".");
  if (parts.length !== 2) return false;

  const [cookieUserId, cookieSignature] = parts;
  if (cookieUserId !== userId) return false;

  const expectedSignature = signUserId(userId);

  // Constant-time comparison to prevent timing attacks
  try {
    const a = Buffer.from(cookieSignature, "hex");
    const b = Buffer.from(expectedSignature, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

