"use server";

import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export interface FormState {
  error?: string;
}

// Server action to authenticate a user using Neon Auth
// Enforces mandatory OTP verification on sign in
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export async function signInWithEmail(
  _prevState: FormState | null | undefined,
  formData: FormData
): Promise<FormState | undefined> {
  const email = (formData.get("email") as string)?.trim() || "";
  const password = (formData.get("password") as string) || "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await auth.signIn.email({
    email,
    password,
  });

  if (error) {
    return {
      error: error.message || "Failed to sign in. Please verify your credentials.",
    };
  }

  // Mark OTP as pending until user verifies their code
  const cookieStore = await cookies();
  cookieStore.set("autopulse_otp_pending", "true", {
    path: "/",
    maxAge: 600,
    sameSite: "lax",
    httpOnly: false,
  });

  // Automatically redirect to OTP verification page
  redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}&type=sign-in`);
}
