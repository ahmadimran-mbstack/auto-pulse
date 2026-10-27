import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);

  // Preserve the exact callback redirect_uri used during Slack OAuth authorization
  const callbackUrl = `${request.nextUrl.origin}${request.nextUrl.pathname}`;
  if (!searchParams.has("redirect_uri")) {
    searchParams.set("redirect_uri", callbackUrl);
  }

  const backendBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const targetUrl = `${backendBase.replace(/\/$/, "")}/integrations/slack/callback?${searchParams.toString()}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "manual",
    });

    const location = res.headers.get("location");
    if (location) {
      const locUrl = new URL(location, request.nextUrl.origin);
      if (locUrl.pathname === "/dashboard") {
        locUrl.pathname = "/app/connections";
      }
      return NextResponse.redirect(locUrl);
    }
  } catch (err) {
    console.error("Failed to forward Slack OAuth callback to backend:", err);
  }

  // Fallback: direct browser redirect to backend callback endpoint
  return NextResponse.redirect(targetUrl);
}
