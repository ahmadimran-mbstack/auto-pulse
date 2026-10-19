import Link from "next/link";

// 404 Not Found page styled with AutoPulse design tokens
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-paper text-ink selection:bg-signal-soft selection:text-signal">
      <div className="w-full max-w-[460px] p-8 sm:p-10 rounded-[16px] border border-line bg-surface card-subtle-shadow text-left space-y-5">
        <div className="w-10 h-10 rounded-[8px] bg-paper border border-line flex items-center justify-center text-signal font-mono text-sm font-bold">
          404
        </div>
        <div>
          <h1 className="text-3xl font-geist font-normal tracking-tighter text-ink mb-2">
            Page not found
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            The page you requested does not exist or may have been moved to another location.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 bg-signal text-surface rounded-[8px] text-sm font-medium hover:bg-signal-hover transition-colors shadow-xs"
          >
            Return to home
          </Link>
        </div>
      </div>
    </main>
  );
}
