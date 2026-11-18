// Signs and verifies the short-lived httpOnly cookie that gates /auth/verify-otp
import crypto from "crypto";

export const VERIFY_EMAIL_COOKIE_NAME = "autopulse_verify_email";
export const VERIFY_EMAIL_TTL_SECONDS = 600;

// Read the signing secret from the server environment
function getSecret(): string {
  return (
    process.env.NEON_AUTH_COOKIE_SECRET ||
    "autopulse-default-cookie-secret-min-32-chars-long"
  );
}

// Compute an HMAC-SHA256 signature for the base64url payload
function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest("hex");
}

// Create a signed token holding the pending verification email and expiry
export function createVerifyEmailCookieValue(email: string): string {
  const cleanEmail = email.trim().toLowerCase();
  const exp = Date.now() + VERIFY_EMAIL_TTL_SECONDS * 1000;
  const encodedPayload = Buffer.from(
    JSON.stringify({ email: cleanEmail, exp }),
    "utf8"
  ).toString("base64url");
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

// Validate the signed cookie and return the email if authentic and not expired
export function verifyVerifyEmailCookieValue(
  cookieValue?: string | null
): string | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, cookieSignature] = parts;
  if (!encodedPayload || !cookieSignature) return null;

  const expectedSignature = signPayload(encodedPayload);
  try {
    const a = Buffer.from(cookieSignature, "hex");
    const b = Buffer.from(expectedSignature, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as { email?: unknown; exp?: unknown };

    if (
      typeof parsed.email !== "string" ||
      !parsed.email ||
      typeof parsed.exp !== "number" ||
      Date.now() > parsed.exp
    ) {
      return null;
    }

    return parsed.email;
  } catch {
    return null;
  }
}

// Build a Set-Cookie header string for setting or clearing the verify-email cookie
export function buildVerifyEmailSetCookieHeader(
  value: string,
  maxAgeSeconds: number
): string {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VERIFY_EMAIL_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secureFlag}`;
}

