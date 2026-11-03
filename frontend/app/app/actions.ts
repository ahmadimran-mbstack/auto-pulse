"use server";

import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";

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

// Server action to terminate the user session and clear all auth cookies
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export async function signOutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();

    // 1. Clear all cookies in the store that match auth, session, or token patterns
    try {
      const allCookies = cookieStore.getAll();
      for (const cookie of allCookies) {
        const nameLower = cookie.name.toLowerCase();
        if (
          nameLower.includes("better-auth") ||
          nameLower.includes("neon-auth") ||
          nameLower.includes("session") ||
          nameLower.includes("autopulse") ||
          nameLower.includes("token") ||
          nameLower.includes("auth")
        ) {
          const isSecureName = cookie.name.startsWith("__Secure-") || cookie.name.startsWith("__Host-");

          cookieStore.set(cookie.name, "", {
            path: "/",
            maxAge: 0,
            expires: new Date(0),
            httpOnly: true,
            secure: isSecureName || process.env.NODE_ENV === "production",
            sameSite: "lax",
          });
          cookieStore.delete(cookie.name);
        }
      }
    } catch (cookieErr) {
      console.warn("Could not iterate all cookies:", cookieErr);
    }

    // 2. Explicitly clear all known session and auth cookie names
    for (const name of AUTH_COOKIE_NAMES) {
      try {
        const isSecureName = name.startsWith("__Secure-") || name.startsWith("__Host-");
        cookieStore.set(name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
          httpOnly: true,
          secure: isSecureName || process.env.NODE_ENV === "production",
          sameSite: "lax",
        });
        cookieStore.delete(name);
      } catch {
        // Ignore single cookie deletion error
      }
    }

    // 3. Set short-lived signed-out sentinel cookie to prevent redirect bounce back to /app
    try {
      cookieStore.set("autopulse_signed_out", "true", {
        path: "/",
        maxAge: 10,
        sameSite: "lax",
      });
    } catch {
      // Ignore sentinel error
    }

    // 4. Best-effort notify upstream Neon Auth server to revoke the session
    try {
      await auth.signOut();
    } catch (authErr) {
      console.warn("Neon auth upstream signOut warning (local cookies already cleared):", authErr);
    }

    return { success: true };
  } catch (error) {
    console.error("Sign out error in server action:", error);
    // Return success: true so the client can always complete sign-out redirect
    return { success: true };
  }
}
