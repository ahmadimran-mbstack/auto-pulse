import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PostDetailClient } from "./PostDetailClient";

// Server components reading session data must be dynamic
export const dynamic = "force-dynamic";

interface PostPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const cookieStore = await cookies();
  const isOtpPending = cookieStore.get("autopulse_otp_pending")?.value === "true";

  // Ensure user has verified their OTP before gaining access
  if (isOtpPending || !session.user.emailVerified) {
    const otpType = !session.user.emailVerified ? "email-verification" : "sign-in";
    redirect(
      `/auth/verify-otp?email=${encodeURIComponent(session.user.email)}&type=${otpType}`
    );
  }

  return <PostDetailClient id={id} />;
}
