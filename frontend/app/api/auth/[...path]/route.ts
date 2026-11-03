import { auth } from "@/lib/auth/server";

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
  "autopulse_otp_pending",
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

  let effectiveOrigin = forceOrigin || (rawOrigin ? normalizeLoopback(rawOrigin) : "http://localhost:3000");
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

export async function POST(request: Request, context: any) {
  let res: Response;
  try {
    res = await executeWithOriginFallback(baseHandlers.POST, request, context);
  } catch (err) {
    // Upstream error or network issue: ensure response is created so client can still receive cookie cleanup
    res = new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Detect sign-out endpoint invocations
  let isSignOut = false;
  try {
    const resolvedParams = context?.params ? await context.params : null;
    const path = Array.isArray(resolvedParams?.path)
      ? resolvedParams.path.join("/")
      : resolvedParams?.path || "";
    if (path.includes("sign-out")) {
      isSignOut = true;
    }
  } catch {
    // Fallback URL inspection
    if (request.url.includes("sign-out")) {
      isSignOut = true;
    }
  }

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
