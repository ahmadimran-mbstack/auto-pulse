// Pure helpers for in-memory API token caching, expiration checks, and in-flight request sharing

// Checks if a token with the given expiry timestamp is still valid
// Reused until bufferMs (default 60,000ms / 60s) before its expiration
export function isTokenValid(
  expiresAt: number,
  now: number = Date.now(),
  bufferMs: number = 60_000
): boolean {
  if (!expiresAt || expiresAt <= 0) return false;
  return now < expiresAt - bufferMs;
}

// Reads the expiration timestamp from an unverified JWT payload without external libraries
export function readTokenExpiry(token: string): number {
  if (!token || typeof token !== "string") {
    return 0;
  }
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      const jsonStr = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const payload = JSON.parse(jsonStr);
      if (typeof payload.exp === "number") {
        return payload.exp * 1000;
      }
    }
  } catch {
    // If decoding fails, return 0 to indicate unknown expiration
  }
  return 0;
}

// TokenCacheManager manages in-memory caching and deduplicates in-flight token requests
export class TokenCacheManager {
  private cachedToken: string | null = null;
  private cachedTokenExpiresAt = 0;
  private inFlightPromise: Promise<string | null> | null = null;
  private bufferMs: number;

  constructor(bufferMs: number = 60_000) {
    this.bufferMs = bufferMs;
  }

  // Returns current cached token if still valid
  getCachedToken(now: number = Date.now()): string | null {
    if (this.cachedToken && isTokenValid(this.cachedTokenExpiresAt, now, this.bufferMs)) {
      return this.cachedToken;
    }
    return null;
  }

  // Returns the expiration timestamp of the cached token
  getExpiresAt(): number {
    return this.cachedTokenExpiresAt;
  }

  // Manually sets a token with expiration
  setToken(token: string, expiresAt: number): void {
    this.cachedToken = token;
    this.cachedTokenExpiresAt = expiresAt;
  }

  // Clears the cache completely on sign out or invalidation
  clear(): void {
    this.cachedToken = null;
    this.cachedTokenExpiresAt = 0;
    this.inFlightPromise = null;
  }

  // Retrieves token using in-memory cache or shares one in-flight promise between concurrent callers
  async getToken(
    fetcher: () => Promise<string | null>,
    forceRefresh: boolean = false,
    now: number = Date.now()
  ): Promise<string | null> {
    if (!forceRefresh) {
      const validToken = this.getCachedToken(now);
      if (validToken) {
        return validToken;
      }
    }

    // Share one in-flight promise if multiple calls occur simultaneously
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = (async () => {
      try {
        const token = await fetcher();
        if (token) {
          const expiresAt = readTokenExpiry(token);
          // Fallback to 15 minutes lifetime if token does not specify exp
          const effectiveExpiry = expiresAt > 0 ? expiresAt : Date.now() + 15 * 60_000;
          this.setToken(token, effectiveExpiry);
          return token;
        }
        this.clear();
        return null;
      } catch (err) {
        this.clear();
        throw err;
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }
}

// Global default token cache manager
export const tokenCache = new TokenCacheManager(60_000);
