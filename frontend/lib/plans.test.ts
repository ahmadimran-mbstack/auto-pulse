import { describe, expect, it, vi, afterEach } from "vitest";
import { getPlans } from "./plans";

describe("getPlans", () => {
  const origEnv = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = origEnv;
    vi.restoreAllMocks();
  });

  it("falls back to bundled snapshot when NEXT_PUBLIC_API_URL points to an unreachable host", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://invalid-backend-host.local:9999";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    const data = await getPlans();
    expect(data.plans.map((p) => p.id)).toEqual(["trial", "starter", "pro", "business"]);
    expect(errSpy).toHaveBeenCalled();
  });
});
