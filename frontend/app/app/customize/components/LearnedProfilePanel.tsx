"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LimitMeter } from "@/components/app/ProgressBars";
import { cn } from "@/lib/utils";
import type { CompiledContextView, PolicyItem } from "@/types/customization";

interface LearnedProfilePanelProps {
  context?: CompiledContextView;
  samplesCount: number;
  isLoading: boolean;
  onSaveVoiceOverride: (summary: string) => void;
  onRemoveFact: (factId: string) => void;
  onGoToPreviousPosts: () => void;
}

const POST_TYPE_TABS = [
  { id: "all", label: "All" },
  { id: "build_in_public", label: "Build in public" },
  { id: "technical_explainer", label: "Explainer" },
  { id: "hot_take", label: "Hot take" },
] as const;

function SourceBadge({ item }: { item: PolicyItem }) {
  const badgeClasses =
    item.source_type === "custom_instructions"
      ? "bg-status-success-bg text-status-success-fg border-status-success-border"
      : item.source_type === "playbook"
        ? "bg-status-info-bg text-status-info-fg border-status-info-border"
        : "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border";

  const label =
    item.source_type === "custom_instructions"
      ? "Your instructions"
      : item.source_type === "playbook"
        ? item.document_name || "Playbook"
        : "Default";

  const pill = (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeClasses,
        item.evidence_quote && "cursor-help"
      )}
    >
      {label}
    </span>
  );

  if (item.source_type === "playbook" && item.evidence_quote) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          &ldquo;{item.evidence_quote}&rdquo;
        </TooltipContent>
      </Tooltip>
    );
  }

  return pill;
}

export function LearnedProfilePanel({
  context,
  samplesCount,
  isLoading,
  onSaveVoiceOverride,
  onRemoveFact,
  onGoToPreviousPosts,
}: LearnedProfilePanelProps) {
  const compiled = context?.compiled;
  const guidance = compiled?.guidance;
  const [voiceDraft, setVoiceDraft] = React.useState(guidance?.voice_summary || "");
  const [editingVoice, setEditingVoice] = React.useState(false);
  const [selectedPostType, setSelectedPostType] = React.useState<string>("all");
  const [showRawWarnings, setShowRawWarnings] = React.useState(false);

  React.useEffect(() => {
    setVoiceDraft(guidance?.voice_summary || "");
  }, [guidance?.voice_summary]);

  if (isLoading || !context) {
    return (
      <Card className="border border-border bg-card shadow-none rounded-lg">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading learned customization profile...
        </CardContent>
      </Card>
    );
  }

  if (compiled?.is_empty) {
    return (
      <Card className="border border-border bg-card shadow-none rounded-lg">
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="text-base">Nothing learned yet</CardTitle>
          <CardDescription>
            Add your LinkedIn playbooks, business URL or documents, previous posts, or custom instructions in the tabs above.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/app/playground">
              <FlaskConical className="size-4 stroke-[1.75]" />
              <span>Test in Playground</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const coverageNotes = compiled?.coverage_warnings ?? [];
  const rawWarnings = context.warnings ?? [];
  const hasNotes = coverageNotes.length > 0 || rawWarnings.length > 0;

  const policyByType = context.policy_items_by_post_type;
  const activePolicyItems: PolicyItem[] =
    (policyByType && policyByType[selectedPostType]) ||
    context.policy_items ||
    [];

  const hasVoiceSummary = Boolean(guidance?.voice_summary?.trim());

  return (
    <div className="space-y-4">
      {hasNotes && (
        <Card className="border border-status-warning-border bg-status-warning-bg shadow-none rounded-lg">
          <CardHeader className="p-4 sm:p-5 pb-2">
            <CardTitle className="text-sm font-medium text-status-warning-fg flex items-center gap-2">
              <TriangleAlert className="size-4 stroke-[1.75] shrink-0" aria-hidden="true" />
              <span>Notes</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
            {coverageNotes.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-xs text-status-warning-fg">
                {coverageNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            )}
            {rawWarnings.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowRawWarnings((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-status-warning-fg/90 hover:text-status-warning-fg cursor-pointer"
                >
                  {showRawWarnings ? (
                    <ChevronDown className="size-3.5 stroke-[1.75]" />
                  ) : (
                    <ChevronRight className="size-3.5 stroke-[1.75]" />
                  )}
                  <span>Technical details ({rawWarnings.length})</span>
                </button>
                {showRawWarnings && (
                  <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-status-warning-fg/90 font-mono">
                    {rawWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Effective post policy */}
      <Card className="border border-border bg-card shadow-none rounded-lg">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border space-y-3">
          <div>
            <CardTitle className="text-base font-medium text-foreground">
              Effective post policy
            </CardTitle>
            <CardDescription>
              Rules enforced on every generated draft and where each rule came from.
            </CardDescription>
          </div>
          {policyByType && (
            <div className="flex flex-wrap gap-1.5">
              {POST_TYPE_TABS.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setSelectedPostType(pt.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer",
                    selectedPostType === pt.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border">
          {activePolicyItems.map((item) => (
            <div
              key={item.key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-5 py-3 text-sm"
            >
              <span className="text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-2.5 sm:justify-end">
                <span className="font-medium text-foreground tabular-nums">
                  {item.value}
                </span>
                <SourceBadge item={item} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Learned voice */}
      <Card className="border border-border bg-card shadow-none rounded-lg">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base font-medium text-foreground">
              Learned voice
            </CardTitle>
            <CardDescription>
              Derived from your previous posts. Used to match your rhythm and phrasing.
            </CardDescription>
          </div>
          {hasVoiceSummary && !editingVoice && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setVoiceDraft(guidance?.voice_summary || "");
                setEditingVoice(true);
              }}
            >
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-4 sm:p-5 space-y-4">
          {editingVoice ? (
            <div className="space-y-3">
              <Textarea
                rows={3}
                value={voiceDraft}
                onChange={(e) => setVoiceDraft(e.target.value)}
                maxLength={1000}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onSaveVoiceOverride(voiceDraft);
                    setEditingVoice(false);
                  }}
                >
                  Save voice summary
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setVoiceDraft(guidance?.voice_summary || "");
                    setEditingVoice(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : hasVoiceSummary ? (
            <>
              <p className="text-sm text-foreground leading-relaxed">
                {guidance?.voice_summary}
              </p>
              {(guidance?.voice_traits?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {guidance?.voice_traits?.map((t, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-start gap-3 py-2">
              <div className="flex items-center gap-2.5 text-sm text-foreground">
                <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <FileText className="size-4 stroke-[1.75]" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Upload or paste at least 5 previous LinkedIn posts so AutoPulse can learn your writing voice.
                </p>
              </div>
              <div className="w-full max-w-sm">
                <LimitMeter current={samplesCount} min={5} max={5} />
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {samplesCount} of 5 posts added
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onGoToPreviousPosts}
              >
                Add previous posts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verified business facts */}
      {(guidance?.business_facts?.length ?? 0) > 0 && (
        <Card className="border border-border bg-card shadow-none rounded-lg">
          <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border">
            <CardTitle className="text-base font-medium text-foreground tabular-nums">
              Verified business facts ({guidance?.business_facts?.length})
            </CardTitle>
            <CardDescription>
              Topic-relevant facts are injected into every post. Remove any fact you do not want used.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-2">
            {guidance?.business_facts?.map((f) => (
              <div
                key={f.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-normal capitalize">
                      {f.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {f.source_label}
                    </span>
                  </div>
                  <p className="text-foreground leading-relaxed">{f.text}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove fact"
                  onClick={() => onRemoveFact(f.id)}
                  className="size-8 shrink-0 text-muted-foreground hover:text-status-danger-fg"
                >
                  <X className="size-4 stroke-[1.75]" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
