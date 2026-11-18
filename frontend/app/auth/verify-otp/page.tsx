import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  VERIFY_EMAIL_COOKIE_NAME,
  verifyVerifyEmailCookieValue,
} from "@/lib/auth/verify-cookie";
import { AuthShell } from "../components/AuthShell";
import { VerifyOtpClient } from "./VerifyOtpClient";

export const dynamic = "force-dynamic";

// Server gate ensuring /auth/verify-otp is only reachable with a valid signed verify cookie
export default async function VerifyOtpPage() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(VERIFY_EMAIL_COOKIE_NAME)?.value;
  const email = verifyVerifyEmailCookieValue(rawCookie);

  if (!email) {
    redirect("/auth/sign-in");
  }

  return (
    <AuthShell
      title="Check your email"
      description={`Enter the 6-digit code sent to ${email}.`}
      footer={
        <p className="text-sm text-muted-foreground text-left font-normal">
          <Link
            href="/auth/sign-in"
            className="text-foreground hover:underline font-normal"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <VerifyOtpClient email={email} />
    </AuthShell>
  );
}
