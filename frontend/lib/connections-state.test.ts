import { describe, expect, it } from "vitest";
import {
  formatConnectionExpiryDate,
  getConnectionDisplayState,
  parseCallbackParams,
} from "./connections-state";
import type { SocialConnection } from "@/types/connections";

describe("getConnectionDisplayState", () => {
  const baseTime = new Date("2026-10-20T12:00:00Z");

  it("returns not_connected when connection is null or undefined", () => {
    expect(getConnectionDisplayState(null, baseTime)).toBe("not_connected");
    expect(getConnectionDisplayState(undefined, baseTime)).toBe("not_connected");
  });

  it("returns connected when status is active and more than 7 days left", () => {
    const conn: SocialConnection = {
      provider: "linkedin",
      status: "active",
      account_name: "Jane Doe",
      connected_at: "2026-10-01T00:00:00Z",
      expires_at: "2026-11-20T12:00:00Z",
      days_left: 31,
    };
    expect(getConnectionDisplayState(conn, baseTime)).toBe("connected");
  });

  it("returns expiring_soon when status is active and days_left is 7 or less", () => {
    const conn7Days: SocialConnection = {
      provider: "linkedin",
      status: "active",
      account_name: "Jane Doe",
      connected_at: "2026-08-20T00:00:00Z",
      expires_at: "2026-10-27T12:00:00Z",
      days_left: 7,
    };
    expect(getConnectionDisplayState(conn7Days, baseTime)).toBe("expiring_soon");

    const conn2Days: SocialConnection = {
      ...conn7Days,
      expires_at: "2026-10-22T12:00:00Z",
      days_left: 2,
    };
    expect(getConnectionDisplayState(conn2Days, baseTime)).toBe("expiring_soon");
  });

  it("returns expired when status is explicitly expired", () => {
    const conn: SocialConnection = {
      provider: "linkedin",
      status: "expired",
      account_name: "Jane Doe",
      connected_at: "2026-08-20T00:00:00Z",
      expires_at: "2026-10-19T12:00:00Z",
      days_left: 0,
    };
    expect(getConnectionDisplayState(conn, baseTime)).toBe("expired");
  });

  it("returns expired when status is revoked", () => {
    const conn: SocialConnection = {
      provider: "linkedin",
      status: "revoked",
      account_name: "Jane Doe",
      connected_at: "2026-08-20T00:00:00Z",
      expires_at: "2026-11-20T12:00:00Z",
      days_left: 31,
    };
    expect(getConnectionDisplayState(conn, baseTime)).toBe("expired");
  });

  it("returns expired when expires_at timestamp is in the past even if status was active", () => {
    const conn: SocialConnection = {
      provider: "linkedin",
      status: "active",
      account_name: "Jane Doe",
      connected_at: "2026-08-20T00:00:00Z",
      expires_at: "2026-10-19T12:00:00Z",
      days_left: 0,
    };
    expect(getConnectionDisplayState(conn, baseTime)).toBe("expired");
  });
});

describe("parseCallbackParams", () => {
  it("extracts code and state from full URL", () => {
    const url = "https://example.com/callback?code=abc123code&state=xyz987state";
    const result = parseCallbackParams(url);
    expect(result.code).toBe("abc123code");
    expect(result.state).toBe("xyz987state");
    expect(result.error).toBeNull();
    expect(result.errorDescription).toBeNull();
  });

  it("extracts code and state from query string starting with question mark", () => {
    const query = "?code=my_code&state=my_state";
    const result = parseCallbackParams(query);
    expect(result.code).toBe("my_code");
    expect(result.state).toBe("my_state");
  });

  it("extracts error and error_description when user cancels", () => {
    const query = "?error=user_cancelled_login&error_description=User+refused+consent";
    const result = parseCallbackParams(query);
    expect(result.error).toBe("user_cancelled_login");
    expect(result.errorDescription).toBe("User refused consent");
    expect(result.code).toBeNull();
    expect(result.state).toBeNull();
  });

  it("handles missing parameters safely", () => {
    const result = parseCallbackParams("");
    expect(result.code).toBeNull();
    expect(result.state).toBeNull();
    expect(result.error).toBeNull();
    expect(result.errorDescription).toBeNull();
  });

  it("accepts URLSearchParams object directly", () => {
    const params = new URLSearchParams("code=sample&state=test");
    const result = parseCallbackParams(params);
    expect(result.code).toBe("sample");
    expect(result.state).toBe("test");
  });
});

describe("formatConnectionExpiryDate", () => {
  it("formats ISO date string into readable date", () => {
    const formatted = formatConnectionExpiryDate("2026-12-25T15:30:00Z", "en-US");
    expect(formatted).toBe("December 25, 2026");
  });

  it("returns fallback input if date is invalid", () => {
    expect(formatConnectionExpiryDate("not-a-date")).toBe("not-a-date");
  });
});
