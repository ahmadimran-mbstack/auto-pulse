import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClientError, apiCall, clearCachedToken, setReconnecting, subscribeReconnecting } from "./api";

const mockToken = vi.fn();
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock("./auth/client", () => ({
  authClient: {
    token: () => mockToken(),
    getSession: () => mockGetSession(),
    signOut: () => mockSignOut(),
  },
}));

describe("apiCall session and reconnecting behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedToken();
    setReconnecting(false);
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_CONTACT_EMAIL = "test@example.com";
    process.env.NEXT_PUBLIC_COMPANY_NAME = "Test";
  });

  it("does NOT set reconnecting or sign out when backend returns 401 while Neon Auth session is valid", async () => {
    mockToken.mockResolvedValue({ data: { token: "jwt-123" } });
    mockGetSession.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Invalid issuer" }), { status: 401 }))
    );

    let latestReconnect = false;
    const unsub = subscribeReconnecting((v) => {
      latestReconnect = v;
    });

    await expect(apiCall("/dashboard")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 401,
      code: "backend_unauthorized",
      requestUrl: "http://localhost:8000/dashboard",
      isNetworkError: false,
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(latestReconnect).toBe(false);
    unsub();
  });

  it("sets reconnecting=true and marks isNetworkError=true only on real network failure", async () => {
    mockToken.mockResolvedValue({ data: { token: "jwt-123" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    let latestReconnect = false;
    const unsub = subscribeReconnecting((v) => {
      latestReconnect = v;
    });

    await expect(apiCall("/dashboard")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 0,
      code: "network_error",
      requestUrl: "http://localhost:8000/dashboard",
      isNetworkError: true,
    });
    expect(latestReconnect).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();
    unsub();
  });

  it("does NOT set reconnecting=true on HTTP 500 and preserves status and requestUrl", async () => {
    mockToken.mockResolvedValue({ data: { token: "jwt-123" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "DB error" }), { status: 500 }))
    );

    let latestReconnect = false;
    const unsub = subscribeReconnecting((v) => {
      latestReconnect = v;
    });

    let caught: unknown;
    try {
      await apiCall("/dashboard");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiClientError);
    expect((caught as ApiClientError).status).toBe(500);
    expect((caught as ApiClientError).requestUrl).toBe("http://localhost:8000/dashboard");
    expect((caught as ApiClientError).isNetworkError).toBe(false);
    expect(latestReconnect).toBe(false);
    unsub();
  });

  it("signs out once when Neon Auth explicitly confirms session is invalid", async () => {
    mockToken.mockResolvedValue({ data: null });
    mockGetSession.mockResolvedValue({ data: null, error: null });
    mockSignOut.mockResolvedValue({});

    await expect(apiCall("/dashboard")).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
