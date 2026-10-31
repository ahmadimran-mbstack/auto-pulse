"use server";

import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";

// Server action to terminate the user session and clear auth cookies
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export async function signOutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    cookieStore.set("autopulse_otp_pending", "", {
      path: "/",
      maxAge: 0,
    });
    cookieStore.set("autopulse_token", "", {
      path: "/",
      maxAge: 0,
    });

    await auth.signOut();
    return { success: true };
  } catch (error) {
    console.error("Sign out error in server action:", error);
    return { success: false, error: "Failed to sign out. Please try again." };
  }
}
