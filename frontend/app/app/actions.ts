"use server";

import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";

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
          nameLower.includes("session") ||
          nameLower.includes("autopulse") ||
          nameLower.includes("token") ||
          nameLower.includes("auth")
        ) {
          cookieStore.set(cookie.name, "", {
            path: "/",
            maxAge: 0,
            expires: new Date(0),
          });
          cookieStore.delete(cookie.name);
        }
      }
    } catch (cookieErr) {
      console.warn("Could not iterate all cookies:", cookieErr);
    }

    // 2. Explicitly clear all known session and auth cookie names
    const knownAuthCookies = [
      "autopulse_otp_pending",
      "autopulse_token",
      "better-auth.session_token",
      "better-auth.local.session_data",
      "better-auth.session_challenge",
      "better-auth.session_challange",
      "__Secure-better-auth.session_token",
      "__Host-better-auth.session_token",
      "better-auth.csrf_token",
    ];

    for (const name of knownAuthCookies) {
      try {
        cookieStore.set(name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
        cookieStore.delete(name);
      } catch {
        // Ignore single cookie deletion error
      }
    }

    // 3. Best-effort notify upstream Neon Auth server to revoke the session
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
