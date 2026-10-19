"use server";

import { auth } from "@/lib/auth/server";
import { isPasswordValid } from "@/lib/auth/password";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export interface FormState {
  error?: string;
  success?: boolean;
}

// Server action to register a new user using Neon Auth
// Enforces strong password rules and redirects to OTP verification
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export async function signUpWithEmail(
  _prevState: FormState | null | undefined,
  formData: FormData
): Promise<FormState | undefined> {
  const email = (formData.get("email") as string)?.trim() || "";
  const name = (formData.get("name") as string)?.trim() || "";
  const password = (formData.get("password") as string) || "";

  if (!email || !name) {
    return { error: "Full name and email address are required." };
  }

  if (!isPasswordValid(password)) {
    return {
      error:
        "Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one special symbol.",
    };
  }

  const { error } = await auth.signUp.email({
    email,
    name,
    password,
  });

  if (error) {
    return {
      error: error.message || "Failed to create account. Please try again.",
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
  redirect(
    `/auth/verify-otp?email=${encodeURIComponent(email)}&type=email-verification`
  );
}
