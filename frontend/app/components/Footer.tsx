import Link from "next/link";
import { ActivityIcon } from "lucide-react";

interface FooterProps {
  contactEmail: string;
  companyName: string;
}

export function Footer({ contactEmail, companyName }: FooterProps) {
  return (
    <footer className="border-t border-border bg-background py-12 mt-auto">
      <div className="page-container mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-8 border-b border-border">
          {/* Brand info */}
          <div className="space-y-2 text-left">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="size-6 rounded-md bg-card border border-border flex items-center justify-center text-primary">
                <ActivityIcon className="size-3.5" strokeWidth={1.5} />
              </div>
              <span className="font-display font-semibold tracking-tight text-lg text-foreground">
                AutoPulse
              </span>
            </Link>
            <p className="text-xs text-muted-foreground max-w-xs leading-normal">
              Daily LinkedIn thought leadership with strict human verification. Nothing published without your approval.
            </p>
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <a
              href={`mailto:${contactEmail}`}
              className="hover:text-foreground transition-colors"
            >
              Support & Inquiries
            </a>
            <Link href="/auth/sign-in" className="hover:text-foreground transition-colors">
              Account Login
            </Link>
          </div>
        </div>

        {/* Bottom copyright and attribution */}
        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
          <div>
            <span>&copy; {new Date().getFullYear()} {companyName}. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            <span>Authenticated with Neon Auth · FastAPI Core</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
