import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_COOKIE_NAMES, signOutAction } from "../app/app/actions";
import { POST as authProxyPost } from "../app/api/auth/[...path]/route";

// Mock next/headers cookies
const mockCookieMap = new Map<string, { value: string; options: any }>();
const mockCookieStore = {
  getAll: vi.fn(() => {
    const list: Array<{ name: string; value: string }> = [];
    mockCookieMap.forEach((entry, name) => {
      list.push({ name, value: entry.value });
    });
    return list;
  }),
  get: vi.fn((name: string) => {
    const entry = mockCookieMap.get(name);
    return entry ? { name, value: entry.value } : undefined;
  }),
  set: vi.fn((name: string, value: string, options: any) => {
    mockCookieMap.set(name, { value, options });
  }),
  delete: vi.fn((name: string) => {
    mockCookieMap.delete(name);
  }),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
  headers: vi.fn(async () => new Headers()),
}));

// Mock auth server
vi.mock("./auth/server", () => ({
  auth: {
    signOut: vi.fn(async () => {}),
    handler: vi.fn(() => ({
      GET: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
      POST: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
      PUT: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
      DELETE: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
      PATCH: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
    })),
  },
}));

describe("Sign Out & Cookie Invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieMap.clear();
  });

  describe("AUTH_COOKIE_NAMES Constant", () => {
    it("includes all canonical Neon Auth cookie variations", () => {
      expect(AUTH_COOKIE_NAMES).toContain("__Secure-neon-auth.session_token");
      expect(AUTH_COOKIE_NAMES).toContain("__Secure-neon-auth.local.session_data");
      expect(AUTH_COOKIE_NAMES).toContain("__Secure-neon-auth.session_challenge");
      expect(AUTH_COOKIE_NAMES).toContain("neon-auth.session_token");
      expect(AUTH_COOKIE_NAMES).toContain("neon-auth.local.session_data");
    });

    it("includes Better Auth and application-specific auth cookies", () => {
      expect(AUTH_COOKIE_NAMES).toContain("__Secure-better-auth.session_token");
      expect(AUTH_COOKIE_NAMES).toContain("better-auth.session_token");
      expect(AUTH_COOKIE_NAMES).toContain("better-auth.local.session_data");
      expect(AUTH_COOKIE_NAMES).toContain("autopulse_token");
      expect(AUTH_COOKIE_NAMES).toContain("autopulse_otp_pending");
    });
  });

  describe("signOutAction", () => {
    it("expires all active cookies matching auth/session/token patterns with secure attribute", async () => {
      // Simulate active session cookies in the store
      mockCookieMap.set("__Secure-neon-auth.session_token", {
        value: "active_token_123",
        options: { path: "/", secure: true, httpOnly: true },
      });
      mockCookieMap.set("__Secure-neon-auth.local.session_data", {
        value: "active_jwt_456",
        options: { path: "/", secure: true, httpOnly: true },
      });
      mockCookieMap.set("autopulse_token", {
        value: "user_token_789",
        options: { path: "/", httpOnly: true },
      });

      const result = await signOutAction();
      expect(result.success).toBe(true);

      // Verify __Secure- cookies were expired with secure: true
      const secureCalls = mockCookieStore.set.mock.calls.filter(
        ([name]) => name === "__Secure-neon-auth.session_token"
      );
      expect(secureCalls.length).toBeGreaterThan(0);
      const lastSecureCall = secureCalls[secureCalls.length - 1];
      expect(lastSecureCall[1]).toBe("");
      expect(lastSecureCall[2].maxAge).toBe(0);
      expect(lastSecureCall[2].secure).toBe(true);

      // Verify sentinel cookie was set
      const sentinelCall = mockCookieStore.set.mock.calls.find(
        ([name]) => name === "autopulse_signed_out"
      );
      expect(sentinelCall).toBeDefined();
      expect(sentinelCall![1]).toBe("true");
    });
  });

  describe("POST /api/auth/[...path] Route Handler", () => {
    it("normalizes loopback IP (127.0.0.1) origin to localhost", async () => {
      const mockRequest = new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Origin": "http://127.0.0.1:3000",
          "Referer": "http://127.0.0.1:3000/auth/sign-in",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "test@example.com", password: "password123" }),
      });
      const context = {
        params: Promise.resolve({ path: ["sign-in", "email"] }),
      };

      const response = await authProxyPost(mockRequest, context);
      expect(response.status).toBe(200);
    });

    it("attaches comprehensive Set-Cookie deletion headers on sign-out requests", async () => {
      const mockRequest = new Request("https://autopulse.example.com/api/auth/sign-out", {
        method: "POST",
      });
      const context = {
        params: Promise.resolve({ path: ["sign-out"] }),
      };

      const response = await authProxyPost(mockRequest, context);
      expect(response.status).toBe(200);

      const setCookieHeaders = response.headers.getSetCookie();
      expect(setCookieHeaders.length).toBeGreaterThan(0);

      // Check for __Secure-neon-auth.session_token deletion
      const sessionTokenCookie = setCookieHeaders.find((h) =>
        h.includes("__Secure-neon-auth.session_token=")
      );
      expect(sessionTokenCookie).toBeDefined();
      expect(sessionTokenCookie).toContain("Max-Age=0");
      expect(sessionTokenCookie).toContain("Secure");

      // Check for __Secure-neon-auth.local.session_data deletion
      const sessionDataCookie = setCookieHeaders.find((h) =>
        h.includes("__Secure-neon-auth.local.session_data=")
      );
      expect(sessionDataCookie).toBeDefined();
      expect(sessionDataCookie).toContain("Max-Age=0");
      expect(sessionDataCookie).toContain("Secure");

      // Check for sentinel cookie
      const sentinelCookie = setCookieHeaders.find((h) =>
        h.includes("autopulse_signed_out=true")
      );
      expect(sentinelCookie).toBeDefined();
    });
  });
});
