import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOutAction } from "../../actions";
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

  const user = session.user;
  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      {/* Top Application Bar */}
      <header className="border-b border-line bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1160px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Brand Logo and Wordmark */}
          <div className="flex items-center gap-6">
            <Link href="/app" prefetch={true} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-[8px] bg-surface border border-line flex items-center justify-center text-signal group-hover:border-signal/40 transition-colors">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12h5l3-7 4 14 3-7h3" />
                </svg>
              </div>
              <span className="font-geist font-normal tracking-tighter text-xl text-ink">
                AutoPulse
              </span>
            </Link>

            <span className="hidden sm:inline-block w-px h-5 bg-line" />

            <div className="hidden sm:flex items-center gap-2 text-xs text-muted">
              <span className="w-2 h-2 rounded-full bg-signal animate-pulse-glow" />
              <span>Workspace Active</span>
            </div>
          </div>

          {/* User profile info and sign out */}
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-linear-to-tr from-[#0B7F70] to-[#14B8A6] text-white flex items-center justify-center text-xs font-bold font-mono">
                {initial}
              </div>
              <div className="hidden md:block text-left text-xs leading-tight">
                <p className="font-semibold text-ink truncate max-w-[180px]">
                  {user.name || user.email}
                </p>
                <p className="text-muted truncate max-w-[180px]">
                  {user.email}
                </p>
              </div>
            </div>

            <form action={signOutAction}>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-[8px] border border-line bg-surface hover:bg-paper text-xs font-medium text-ink transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main post detail container */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10">
        <PostDetailClient id={id} />
      </main>
    </div>
  );
}
