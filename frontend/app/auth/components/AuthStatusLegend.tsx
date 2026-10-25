import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CheckCircle2, ShieldCheck } from "lucide-react";

// Informational card displayed beside auth screens on desktop viewports
// Explains the core promise that every post requires human sign off
export function AuthStatusLegend() {
  return (
    <Card className="w-full max-w-md p-8 border-border bg-card text-left">
      <div className="flex items-center gap-2 mb-2">
        <span className="size-2 rounded-full bg-primary" />
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
      <div className="space-y-3 mb-8">
        <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/50">
          <div className="flex items-center gap-3">
            <Badge variant="draft">Draft</Badge>
            <span className="text-meta font-medium text-foreground">
              Morning discovery
            </span>
          </div>
          <span className="text-meta text-muted-foreground">
            Waiting in queue
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-md border border-signal-line bg-signal-soft/40">
          <div className="flex items-center gap-3">
            <Badge variant="approved">Approved</Badge>
            <span className="text-meta font-medium text-foreground">
              Human sign-off
            </span>
          </div>
          <span className="text-meta text-primary font-medium">
            Ready to dispatch
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/50">
          <div className="flex items-center gap-3">
            <Badge variant="published" className="flex items-center gap-1">
              <Check className="size-3 text-primary" strokeWidth={2} />
              Published
            </Badge>
            <span className="text-meta font-medium text-foreground">
              Live on feed
            </span>
          </div>
          <span className="text-meta text-muted-foreground">
            Official API call
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/50">
          <div className="flex items-center gap-3">
            <Badge variant="danger">Rejected</Badge>
            <span className="text-meta font-medium text-foreground">
              Discarded
            </span>
          </div>
          <span className="text-meta text-muted-foreground">
            Never leaves system
          </span>
        </div>
      </div>

      {/* Trust reassurance items */}
      <div className="pt-6 border-t border-border space-y-2 text-meta text-muted-foreground">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary shrink-0" strokeWidth={1.5} />
          <span>Official LinkedIn OAuth with revocable permissions</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary shrink-0" strokeWidth={1.5} />
          <span>No automated scheduling or publishing overrides</span>
        </div>
      </div>
    </Card>
  );
}
