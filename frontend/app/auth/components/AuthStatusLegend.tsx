import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CheckCircle2, ShieldCheck } from "lucide-react";

// Quiet informational card displayed beside auth forms on desktop viewports
// Explains the core promise that every post requires human sign-off
export function AuthStatusLegend() {
  return (
    <Card className="w-full max-w-[400px] p-6 sm:p-8 border-border bg-card text-left">
      <div className="flex items-center gap-2 mb-2">
        <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        <span className="text-caption font-medium text-primary">
          Strict approval standard
        </span>
      </div>

      <h2 className="text-h2 font-display text-foreground mb-3">
        You approve every post
      </h2>
      <p className="text-body text-muted-foreground mb-6">
        AutoPulse operates as your dedicated research and creative team. Drafts and branded graphics wait in your dashboard until you explicitly confirm them.
      </p>

      {/* Visual status ledger using canonical shadcn badge variants */}
      <div className="space-y-3 mb-6">
        <div className="p-3 rounded-md border border-border bg-secondary/50 flex items-center justify-between gap-3">
          <Badge variant="draft">Draft</Badge>
          <span className="text-caption text-muted-foreground text-right">
            Prepared each morning from fresh topics
          </span>
        </div>

        <div className="p-3 rounded-md border border-signal-line bg-signal-soft/40 flex items-center justify-between gap-3">
          <Badge variant="approved">Approved</Badge>
          <span className="text-caption text-primary font-medium text-right">
            Confirmed by you and queued for dispatch
          </span>
        </div>

        <div className="p-3 rounded-md border border-border bg-secondary/50 flex items-center justify-between gap-3">
          <Badge variant="published" className="flex items-center gap-1">
            <Check className="size-3 text-primary" strokeWidth={2} aria-hidden="true" />
            Published
          </Badge>
          <span className="text-caption text-muted-foreground text-right">
            Live on your LinkedIn profile via official API
          </span>
        </div>

        <div className="p-3 rounded-md border border-border bg-secondary/50 flex items-center justify-between gap-3">
          <Badge variant="danger">Rejected</Badge>
          <span className="text-caption text-muted-foreground text-right">
            Discarded and never published anywhere
          </span>
        </div>
      </div>

      {/* Trust reassurance items */}
      <div className="pt-6 border-t border-border space-y-2 text-caption text-muted-foreground">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>Official LinkedIn OAuth with revocable permissions</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>No automated publishing or background posting</span>
        </div>
      </div>
    </Card>
  );
}
