import { timingSafeEqual } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = (process.env.REVALIDATE_SECRET || "").trim();
  const provided = (request.headers.get("x-revalidate-secret") || "").trim();

  if (!expected || !provided || !secretsMatch(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("plans", { expire: 0 });
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/app/billing");

  return NextResponse.json({
    ok: true,
    revalidated: ["plans", "/", "/pricing", "/app/billing"],
  });
}
