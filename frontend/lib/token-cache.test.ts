import { describe, it, expect, vi } from "vitest";
import {
  isTokenValid,
  readTokenExpiry,
  TokenCacheManager,
} from "./token-cache";

describe("token expiry timing and validation", () => {
  it("considers token valid when current time is earlier than expiry minus 60s buffer", () => {
    const now = 1_000_000;
    // Expiring in 120 seconds -> 60s after buffer -> valid
    const expiresAt = now + 120_000;
    expect(isTokenValid(expiresAt, now, 60_000)).toBe(true);
  });

  it("considers token invalid when within the 60s buffer before expiration", () => {
    const now = 1_000_000;
    // Expiring in 30 seconds -> within 60s buffer -> invalid
    const expiresAt = now + 30_000;
    expect(isTokenValid(expiresAt, now, 60_000)).toBe(false);
  });

  it("considers token invalid when already expired", () => {
    const now = 1_000_000;
    const expiresAt = now - 5_000;
    expect(isTokenValid(expiresAt, now, 60_000)).toBe(false);
  });

  it("extracts expiration timestamp from JWT payload", () => {
    // JWT with payload {"exp": 1700000000, "sub": "usr_123"}
    // eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3MDAwMDAwMDAsInN1YiI6InVzcl8xMjMifQ.signature
    const mockJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3MDAwMDAwMDAsInN1YiI6InVzcl8xMjMifQ.signature";
    expect(readTokenExpiry(mockJwt)).toBe(1700000000 * 1000);
  });

  it("returns 0 for malformed or empty token without throwing", () => {
    expect(readTokenExpiry("")).toBe(0);
    expect(readTokenExpiry("invalid-token")).toBe(0);
  });
});

describe("sharing of one in-flight request", () => {
  it("shares single promise between simultaneous token requests", async () => {
    const manager = new TokenCacheManager(60_000);
    let callCount = 0;

    const mockFetcher = vi.fn(async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Returns a valid mock JWT with far-future expiry
      return "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjI1MDAwMDAwMDB9.signature";
    });

    // Launch three concurrent token requests
    const [t1, t2, t3] = await Promise.all([
      manager.getToken(mockFetcher),
      manager.getToken(mockFetcher),
      manager.getToken(mockFetcher),
    ]);

    expect(callCount).toBe(1);
    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(t1).toBe(t2);
    expect(t2).toBe(t3);
    expect(typeof t1).toBe("string");
  });

  it("clears cached token and allows new fetch when invalidated", async () => {
    const manager = new TokenCacheManager(60_000);
    let callCount = 0;

    const mockFetcher = vi.fn(async () => {
      callCount++;
      return "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjI1MDAwMDAwMDB9.signature";
    });

    const token1 = await manager.getToken(mockFetcher);
    expect(callCount).toBe(1);

    // Immediate second call should reuse cached token
    const token2 = await manager.getToken(mockFetcher);
    expect(callCount).toBe(1);
    expect(token1).toBe(token2);

    // Clear cache and call again
    manager.clear();
    const token3 = await manager.getToken(mockFetcher);
    expect(callCount).toBe(2);
    expect(token3).toBe(token1);
  });
});
