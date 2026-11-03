"use server";

import { cookies } from "next/headers";
import { auth } from "@/lib/auth/server";
import {
  createOnboardingCookieValue,
  ONBOARDING_COMPLETED_COOKIE,
} from "@/lib/onboarding-cookie";

// Sets the signed httpOnly cookie marking onboarding as completed
// This allows subsequent /app requests to skip database queries
export async function setOnboardingCompletedCookieAction(): Promise<{ success: boolean }> {
  try {
    const res = await auth.getSession();
    const session = res?.data;

    if (!session?.user?.id) {
      return { success: false };
    }

    const cookieVal = createOnboardingCookieValue(session.user.id);
    const cookieStore = await cookies();

    // 1-year expiration for completed onboarding
    cookieStore.set(ONBOARDING_COMPLETED_COOKIE, cookieVal, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 31536000, // 365 days in seconds
    });

    return { success: true };
  } catch (err) {
    console.warn("Failed to set onboarding completed cookie:", err);
    return { success: false };
  }
}

