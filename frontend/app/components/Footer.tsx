import Link from "next/link";

interface FooterProps {
  contactEmail: string;
  companyName: string;
}

export function Footer({ contactEmail, companyName }: FooterProps) {
  return (
    <footer className="border-t border-line bg-paper py-14 mt-auto">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-10 border-b border-line">
          {/* Brand info */}
          <div className="space-y-2 text-left">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-6 h-6 rounded-[6px] bg-surface border border-line flex items-center justify-center text-signal">
                <svg
                  className="w-3.5 h-3.5"
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
              <span className="font-geist font-normal tracking-tighter text-lg text-ink">
                AutoPulse
              </span>
            </Link>
            <p className="text-xs text-muted max-w-[340px]">
              Daily LinkedIn thought leadership with strict human verification. Nothing published without your approval.
            </p>
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted">
            <Link href="/privacy" className="hover:text-ink transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-ink transition-colors">
              Terms of Service
            </Link>
            <a
              href={`mailto:${contactEmail}`}
              className="hover:text-ink transition-colors"
            >
              Support & Inquiries
            </a>
            <Link href="/auth/sign-in" className="hover:text-ink transition-colors">
              Account Login
            </Link>
          </div>
        </div>

        {/* Bottom copyright and attribution */}
        <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted">
          <div>
            <span>&copy; {new Date().getFullYear()} {companyName}. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-2 text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-signal" />
            <span>Authenticated with Neon Auth · FastAPI Core</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
