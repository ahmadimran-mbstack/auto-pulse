"use server";

import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Server action to terminate the user session
// Reference: https://neon.com/docs/auth/quick-start/nextjs-api-only
export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.set("autopulse_otp_pending", "", {
    path: "/",
    maxAge: 0,
  });

  await auth.signOut();
  redirect("/auth/sign-in");
}
