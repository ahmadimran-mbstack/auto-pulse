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
    const errCode = (error as { code?: string }).code;
    if (errCode === "EMAIL_NOT_VERIFIED") {
      redirect("/auth/verify-otp");
    }
    return {
      error: "Incorrect email or password.",
    };
  }

  // Verified users with the right password go straight to the app
  redirect("/app");
}
