import Link from "next/link";
import { Activity } from "lucide-react";

interface FooterProps {
  contactEmail: string;
  companyName: string;
}

export function Footer({ contactEmail, companyName }: FooterProps) {
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="page-container mx-auto px-4 md:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-border text-left">
          {/* Brand info */}
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-card border border-border flex items-center justify-center text-primary">
              <Activity className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <span className="font-display font-semibold text-foreground text-meta">
              AutoPulse
            </span>
          </div>

          {/* Core navigation links */}
          <div className="flex flex-wrap items-center gap-6 text-meta text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <a
              href={`mailto:${contactEmail}`}
              className="hover:text-foreground transition-colors"
            >
              Contact
            </a>
          </div>
        </div>

        {/* Company attribution */}
        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-caption text-muted-foreground text-left">
          <p>
            AutoPulse by {companyName}
          </p>
          <p className="tabular-nums">
            &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
