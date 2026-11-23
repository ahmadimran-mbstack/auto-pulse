import snapshot from "./plans.snapshot.json";
import type { PublicPlansResponse } from "@/types/plans";

function isValidPlansPayload(data: unknown): data is PublicPlansResponse {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.pkr_per_usd !== "number" || typeof obj.annual_discount !== "number") {
    return false;
  }
  if (!Array.isArray(obj.plans) || obj.plans.length === 0) {
    return false;
  }
  return obj.plans.every(
    (p) =>
      p &&
      typeof p === "object" &&
      typeof (p as Record<string, unknown>).id === "string" &&
      typeof (p as Record<string, unknown>).name === "string" &&
      typeof (p as Record<string, unknown>).monthly_price_usd === "number" &&
      typeof (p as Record<string, unknown>).limits === "object" &&
      typeof (p as Record<string, unknown>).features === "object"
  );
}

export function getSnapshotPlans(): PublicPlansResponse {
  return {
    currency: "USD",
    pkr_per_usd: snapshot.pkr_per_usd,
    annual_discount: snapshot.annual_discount,
    plans: snapshot.plans as PublicPlansResponse["plans"],
  };
}

/**
 * Server-side plans loader with 5-minute ISR revalidation, 4s timeout,
 * and automatic fallback to the bundled snapshot on any failure.
 */
export async function getPlans(): Promise<PublicPlansResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (!apiUrl) {
    console.error("[getPlans] NEXT_PUBLIC_API_URL is not set; using bundled plans snapshot.");
    return getSnapshotPlans();
  }

  try {
    const res = await fetch(`${apiUrl}/api/plans`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.error(`[getPlans] /api/plans returned HTTP ${res.status}; using bundled plans snapshot.`);
      return getSnapshotPlans();
    }
    const json: unknown = await res.json();
    if (!isValidPlansPayload(json)) {
      console.error("[getPlans] /api/plans returned invalid payload shape; using bundled plans snapshot.");
      return getSnapshotPlans();
    }
    return json;
  } catch (err) {
    console.error("[getPlans] Failed to fetch /api/plans; using bundled plans snapshot:", err);
    return getSnapshotPlans();
  }
}
