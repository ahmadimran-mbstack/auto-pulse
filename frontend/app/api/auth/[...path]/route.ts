import crypto from "crypto";
import { auth } from "@/lib/auth/server";
import {
  VERIFY_EMAIL_COOKIE_NAME,
  VERIFY_EMAIL_TTL_SECONDS,
  buildVerifyEmailSetCookieHeader,
  createVerifyEmailCookieValue,
  verifyVerifyEmailCookieValue,
} from "@/lib/auth/verify-cookie";

// Proxies all Neon Auth authentication endpoints through Next.js API route
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
const baseHandlers = auth.handler();

export const AUTH_COOKIE_NAMES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
  "__Secure-neon-auth.session_challenge",
  "__Secure-neon-auth.session_challange",
  "neon-auth.session_token",
  "neon-auth.local.session_data",
  "neon-auth.session_challenge",
  "neon-auth.session_challange",
  "__Secure-neon-auth.csrf_token",
  "neon-auth.csrf_token",
  "__Secure-better-auth.session_token",
  "__Secure-better-auth.local.session_data",
  "__Secure-better-auth.session_challenge",
  "__Secure-better-auth.session_challange",
  "__Host-better-auth.session_token",
  "better-auth.session_token",
  "better-auth.local.session_data",
  "better-auth.session_challenge",
  "better-auth.session_challange",
  "better-auth.csrf_token",
  "autopulse_token",
  VERIFY_EMAIL_COOKIE_NAME,
  "autopulse_onboarding_completed",
  "session_token",
  "session",
];

// Helper to normalize any local loopback IP (127.0.0.1, 0.0.0.0, [::1]) to localhost
function normalizeLoopback(val: string): string {
  if (!val) return val;
  return val
    .replace(/:\/\/127\.0\.0\.1(:[0-9]+)?/g, "://localhost$1")
    .replace(/:\/\/0\.0\.0\.0(:[0-9]+)?/g, "://localhost$1")
    .replace(/:\/\/\[::1\](:[0-9]+)?/g, "://localhost$1");
}

async function sanitizeAuthRequest(request: Request, forceOrigin?: string): Promise<Request> {
  const headers = new Headers(request.headers);
  const rawOrigin = headers.get("origin") || "";
  const rawReferer = headers.get("referer") || "";

  const proto = headers.get("x-forwarded-proto") || "https";
  const host = headers.get("x-forwarded-host") || headers.get("host");
  const hostOrigin = host ? `${proto}://${host}` : null;
  const fallbackOrigin = hostOrigin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  let effectiveOrigin = forceOrigin || (rawOrigin ? normalizeLoopback(rawOrigin) : fallbackOrigin);
  if (effectiveOrigin.includes("127.0.0.1") || effectiveOrigin.includes("0.0.0.0")) {
    effectiveOrigin = normalizeLoopback(effectiveOrigin);
  }

  headers.set("origin", effectiveOrigin);

  if (rawReferer) {
    const effectiveReferer = forceOrigin
      ? rawReferer.replace(/https?:\/\/[^/]+/i, forceOrigin)
      : normalizeLoopback(rawReferer);
    headers.set("referer", effectiveReferer);
  }

  let bodyText: string | undefined = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      bodyText = await request.clone().text();
    } catch {
      // Body may be empty or already consumed
    }
  }

  const effectiveUrl = normalizeLoopback(request.url);

  return new Request(effectiveUrl, {
    method: request.method,
    headers,
    body: bodyText,
  });
}

async function executeWithOriginFallback(
  handler: (req: Request, ctx: any) => Promise<Response>,
  request: Request,
  context: any
): Promise<Response> {
  const sanitizedReq = await sanitizeAuthRequest(request);
  let res = await handler(sanitizedReq, context);

  // If upstream rejected with INVALID_ORIGIN, retry with fallback trusted origin
  if (res.status === 403) {
    try {
      const cloned = res.clone();
      const data = await cloned.json().catch(() => null);
      if (
        data &&
        (data.code === "INVALID_ORIGIN" ||
          (typeof data.message === "string" && data.message.toLowerCase().includes("origin")))
      ) {
        const retryReq = await sanitizeAuthRequest(request, "http://localhost:3000");
        res = await handler(retryReq, context);
      }
    } catch {
      // Fallback inspection failed; return original response
    }
  }

  return res;
}

export async function GET(request: Request, context: any) {
  return executeWithOriginFallback(baseHandlers.GET, request, context);
}

export async function PUT(request: Request, context: any) {
  return executeWithOriginFallback(baseHandlers.PUT, request, context);
}

export async function DELETE(request: Request, context: any) {
  return executeWithOriginFallback(baseHandlers.DELETE, request, context);
}

export async function PATCH(request: Request, context: any) {
  return executeWithOriginFallback(baseHandlers.PATCH, request, context);
}

// Extract the sub-path under /api/auth/ from Next.js route params or URL
async function getAuthSubPath(request: Request, context: any): Promise<string> {
  try {
    const resolvedParams = context?.params ? await context.params : null;
    if (Array.isArray(resolvedParams?.path)) {
      return resolvedParams.path.join("/");
    }
    if (typeof resolvedParams?.path === "string") {
      return resolvedParams.path;
    }
  } catch {
    // Fall back to URL parsing when params are unavailable
  }
  return new URL(request.url).pathname.replace(/^\/api\/auth\/?/, "");
}

// Read a named cookie value from the raw Cookie request header
function getCookieFromHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// Extract the client IP address for rate limiting
function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

// Ask the backend rate limiter whether an OTP email send is allowed
async function checkBackendOtpRateLimit(
  email: string,
  ip: string
): Promise<{ allowed: true } | { allowed: false; retryAfter: number; message: string }> {
  const backendBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  const res = await fetch(`${backendBase}/auth/otp-rate-limit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ip }),
    cache: "no-store",
  });
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const retryAfter = Number(data?.retry_after || res.headers.get("Retry-After") || 60);
    return {
      allowed: false,
      retryAfter,
      message: data?.message || `Please wait ${retryAfter} seconds before requesting another code.`,
    };
  }
  return { allowed: true };
}

export async function POST(request: Request, context: any) {
  const subPath = await getAuthSubPath(request, context);

  // Block passwordless OTP sign-in endpoint completely
  if (subPath === "sign-in/email-otp" || subPath.endsWith("/sign-in/email-otp")) {
    return new Response(JSON.stringify({ message: "Not found", code: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let bodyText: string | undefined;
  let bodyJson: Record<string, any> | null = null;
  try {
    bodyText = await request.clone().text();
    if (bodyText) {
      bodyJson = JSON.parse(bodyText);
    }
  } catch {
    // Non-JSON or empty body
  }

  // Block passwordless sign-in OTP sends and enforce signed-cookie + rate limits on OTP sends
  if (subPath === "email-otp/send-verification-otp" || subPath.endsWith("/email-otp/send-verification-otp")) {
    const otpType = bodyJson?.type;
    if (otpType === "sign-in") {
      return new Response(JSON.stringify({ message: "Not found", code: "NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let targetEmail = typeof bodyJson?.email === "string" ? bodyJson.email.trim().toLowerCase() : "";

    // For email verification, require the signed verify-email cookie and pin email to it
    if (otpType === "email-verification") {
      const rawCookie = getCookieFromHeader(request.headers.get("cookie"), VERIFY_EMAIL_COOKIE_NAME);
      const verifiedEmail = verifyVerifyEmailCookieValue(rawCookie);
      if (!verifiedEmail) {
        return new Response(
          JSON.stringify({
            message: "Verification session expired. Please sign in or sign up again.",
            code: "VERIFY_SESSION_REQUIRED",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      targetEmail = verifiedEmail;
      if (bodyJson) {
        bodyJson.email = verifiedEmail;
        bodyText = JSON.stringify(bodyJson);
      }
    }

    if (targetEmail) {
      const limitResult = await checkBackendOtpRateLimit(targetEmail, getClientIp(request));
      if (!limitResult.allowed) {
        return new Response(
          JSON.stringify({
            code: "rate_limited",
            message: limitResult.message,
            retry_after: limitResult.retryAfter,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(limitResult.retryAfter),
            },
          }
        );
      }
    }

    // Log OTP dispatch with a unique request id (never log email or code)
    console.info("[OTP_SEND]", { requestId: crypto.randomUUID(), type: otpType || "unknown" });
  }

  // Forward request (using potentially pinned bodyText for send-verification-otp)
  const forwardReq =
    bodyText !== undefined
      ? new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: bodyText,
      })
      : request;

  let res: Response;
  try {
    res = await executeWithOriginFallback(baseHandlers.POST, forwardReq, context);
  } catch {
    // Upstream error or network issue: ensure response is created so client can still receive cookie cleanup
    res = new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Issue signed verify-email cookie after sign-up so /auth/verify-otp is reachable
  if ((subPath === "sign-up/email" || subPath.endsWith("/sign-up/email")) && res.ok) {
    const email = typeof bodyJson?.email === "string" ? bodyJson.email.trim().toLowerCase() : "";
    if (email) {
      console.info("[OTP_SEND]", { requestId: crypto.randomUUID(), type: "sign-up" });
      const newHeaders = new Headers(res.headers);
      newHeaders.append(
        "Set-Cookie",
        buildVerifyEmailSetCookieHeader(createVerifyEmailCookieValue(email), VERIFY_EMAIL_TTL_SECONDS)
      );
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    }
  }

  // Issue signed verify-email cookie when sign-in fails with 403 EMAIL_NOT_VERIFIED
  if ((subPath === "sign-in/email" || subPath.endsWith("/sign-in/email")) && res.status === 403) {
    const resText = await res.text();
    let resData: Record<string, any> | null = null;
    try {
      resData = JSON.parse(resText);
    } catch {
      resData = null;
    }
    if (resData?.code === "EMAIL_NOT_VERIFIED") {
      const email = typeof bodyJson?.email === "string" ? bodyJson.email.trim().toLowerCase() : "";
      if (email) {
        const newHeaders = new Headers(res.headers);
        newHeaders.append(
          "Set-Cookie",
          buildVerifyEmailSetCookieHeader(createVerifyEmailCookieValue(email), VERIFY_EMAIL_TTL_SECONDS)
        );
        newHeaders.delete("content-encoding");
        newHeaders.delete("content-length");
        return new Response(resText, {
          status: res.status,
          statusText: res.statusText,
          headers: newHeaders,
        });
      }
    }
    const passthroughHeaders = new Headers(res.headers);
    passthroughHeaders.delete("content-encoding");
    passthroughHeaders.delete("content-length");
    return new Response(resText, {
      status: res.status,
      statusText: res.statusText,
      headers: passthroughHeaders,
    });
  }

  // Clear verify-email cookie once email verification succeeds
  if ((subPath === "email-otp/verify-email" || subPath.endsWith("/email-otp/verify-email")) && res.ok) {
    const newHeaders = new Headers(res.headers);
    newHeaders.append("Set-Cookie", buildVerifyEmailSetCookieHeader("", 0));
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  }

  // Detect sign-out endpoint invocations
  const isSignOut = subPath.includes("sign-out");

  if (isSignOut) {
    const newHeaders = new Headers(res.headers);

    // Explicitly delete every known auth cookie with standard deletion attributes
    for (const name of AUTH_COOKIE_NAMES) {
      const isSecure = name.startsWith("__Secure-") || name.startsWith("__Host-");

      // Deletion header with Secure flag (strictly required for __Secure- and __Host- cookies by RFC 6265bis)
      newHeaders.append(
        "Set-Cookie",
        `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${isSecure ? "; Secure" : ""}`
      );

      // Deletion header without Secure flag for non-secure cookies on local HTTP environments
      if (!isSecure) {
        newHeaders.append(
          "Set-Cookie",
          `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
        );
      }
    }

    // Set signed-out sentinel cookie to prevent immediate redirect bounce back to /app
    newHeaders.append(
      "Set-Cookie",
      "autopulse_signed_out=true; Path=/; Max-Age=10; SameSite=Lax"
    );

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  }

  return res;
}
