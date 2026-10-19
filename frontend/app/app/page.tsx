import { auth } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOutAction } from "./actions";
import { ApiCheckPanel } from "./components/ApiCheckPanel";
import { AccountLinkingPanel } from "./components/AccountLinkingPanel";
import { env } from "@/lib/env";

// Server components reading session data must be dynamic
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const cookieStore = await cookies();
  const isOtpPending = cookieStore.get("autopulse_otp_pending")?.value === "true";

  // Ensure user has verified their OTP before gaining access to the dashboard
  if (isOtpPending || !session.user.emailVerified) {
    const otpType = !session.user.emailVerified ? "email-verification" : "sign-in";
    redirect(
      `/auth/verify-otp?email=${encodeURIComponent(session.user.email)}&type=${otpType}`
    );
  }

  const user = session.user;
  const apiUrl = env.apiUrl;
  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      {/* Top Application Bar */}
      <header className="border-b border-line bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1160px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Brand Logo & Wordmark */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
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

          {/* User profile info & sign out */}
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-6 py-10 text-left space-y-8">
        {/* Welcome Greeting */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-signal font-mono">
              Morning Briefing
            </span>
            <span className="text-xs text-muted">·</span>
            <span className="text-xs text-muted">Queue updated at 08:00 AM</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-geist font-normal tracking-tighter text-ink mb-2">
            Welcome back, {user.name || user.email}
          </h1>
          <p className="text-muted text-sm max-prose-copy">
            Here is your daily LinkedIn overview. Review today&apos;s AI-crafted thought leadership post, verify your connected accounts, or check your backend connection.
          </p>
        </div>

        {/* Dashboard 3-Stat Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="p-5 rounded-[12px] border border-line bg-surface text-left card-subtle-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted">Today&apos;s Queue</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-draft-text bg-draft-bg border border-amber-200">
                1 Draft Ready
              </span>
            </div>
            <p className="text-xl font-geist font-normal tracking-tighter text-ink mb-1">
              Awaiting Approval
            </p>
            <p className="text-xs text-muted">
              Prepared for your industry niche
            </p>
          </div>

          <div className="p-5 rounded-[12px] border border-line bg-surface text-left card-subtle-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted">Publishing Safety</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-signal bg-signal-soft border border-[#93D7CE]">
                100% Protected
              </span>
            </div>
            <p className="text-xl font-geist font-normal tracking-tighter text-ink mb-1">
              Zero Auto-Publish
            </p>
            <p className="text-xs text-muted">
              Nothing posts without your click
            </p>
          </div>

          <div className="p-5 rounded-[12px] border border-line bg-surface text-left card-subtle-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted">Auth Status</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-ink bg-paper border border-line">
                Neon Auth Active
              </span>
            </div>
            <p className="text-xl font-geist font-normal tracking-tighter text-ink mb-1">
              Ed25519 JWT
            </p>
            <p className="text-xs text-muted">
              Cryptographically verified
            </p>
          </div>
        </div>

        {/* Two-column layout for controls & settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left Column: Connected Accounts */}
          <div className="space-y-6">
            <AccountLinkingPanel userEmail={user.email} />
          </div>

          {/* Right Column: FastAPI Service Verification */}
          <div className="space-y-6">
            <ApiCheckPanel apiUrl={apiUrl} />
          </div>
        </div>
      </main>
    </div>
  );
}
