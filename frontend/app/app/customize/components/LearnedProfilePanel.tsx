"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  HistoryIcon,
  PlayIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CompiledContextView } from "@/types/customization";

interface LearnedProfilePanelProps {
  context?: CompiledContextView;
  isLoading: boolean;
  onSaveVoiceOverride: (summary: string) => void;
  onRemoveFact: (factId: string) => void;
  onRebuild: () => void;
  onOpenHistory: () => void;
  isRebuilding: boolean;
}

export function LearnedProfilePanel({
  context,
  isLoading,
  onSaveVoiceOverride,
  onRemoveFact,
  onRebuild,
  onOpenHistory,
  isRebuilding,
}: LearnedProfilePanelProps) {
  const compiled = context?.compiled;
  const policy = compiled?.policy;
  const guidance = compiled?.guidance;
  const [voiceDraft, setVoiceDraft] = React.useState(guidance?.voice_summary || "");
  const [editingVoice, setEditingVoice] = React.useState(false);

  React.useEffect(() => {
    setVoiceDraft(guidance?.voice_summary || "");
  }, [guidance?.voice_summary]);

  if (isLoading || !context) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading learned customization profile...
        </CardContent>
      </Card>
    );
  }

  if (compiled?.is_empty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What AutoPulse knows about your writing</CardTitle>
          <CardDescription>
            Nothing uploaded yet. Add a LinkedIn playbook, your business URL or docs, previous posts, or custom instructions in the tabs above.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/app/playground">
              <PlayIcon className="size-4 mr-2" />
              Test in Playground
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="tabular-nums">
            v{context.version}
          </Badge>
          {context.compile_pending && (
            <Badge variant="info">Recompiling...</Badge>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {compiled?.sources.length ?? 0} active source{(compiled?.sources.length ?? 0) === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenHistory}>
            <HistoryIcon className="size-4 mr-1.5" />
            Version history
          </Button>
          <Button variant="outline" size="sm" onClick={onRebuild} disabled={isRebuilding}>
            <RefreshCwIcon className="size-4 mr-1.5" />
            Rebuild
          </Button>
          <Button asChild size="sm">
            <Link href="/app/playground">
              <PlayIcon className="size-4 mr-1.5" />
              Test in Playground
            </Link>
          </Button>
        </div>
      </div>

      {(context.warnings?.length ?? 0) > 0 && (
        <Alert variant="warning">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle>Compiler notes</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              {context.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {policy && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effective post policy</CardTitle>
            <CardDescription>
              Hard constraints enforced on every draft, with where each setting came from.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="tabular-nums">
              Length: {policy.length_min}–{policy.length_max} chars ({policy.provenance?.length_max || "default"})
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              Hook max: {policy.first_line_max} chars
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              Hashtags: {policy.hashtags_min}–{policy.hashtags_max} ({policy.hashtag_case})
            </Badge>
            <Badge variant="secondary">Emojis: {policy.emoji_policy}</Badge>
            <Badge variant="secondary">Question ending: {policy.question_ending}</Badge>
            {policy.required_end_phrase && (
              <Badge variant="outline">Sign-off: {policy.required_end_phrase}</Badge>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Learned voice</CardTitle>
            <CardDescription>Derived from your previous posts. You can edit this summary.</CardDescription>
          </div>
          {!editingVoice && (
            <Button variant="ghost" size="sm" onClick={() => setEditingVoice(true)}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {editingVoice ? (
            <div className="space-y-2">
              <Textarea
                rows={3}
                value={voiceDraft}
                onChange={(e) => setVoiceDraft(e.target.value)}
                maxLength={1000}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onSaveVoiceOverride(voiceDraft);
                    setEditingVoice(false);
                  }}
                >
                  Save voice summary
                </Button>
                <Button
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
          ) : (
            <p className="text-sm text-foreground">
              {guidance?.voice_summary || "No voice summary learned yet. Upload 5+ previous posts to learn your cadence."}
            </p>
          )}

          {(guidance?.voice_traits?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {guidance?.voice_traits?.map((t, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(guidance?.business_facts?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Verified business facts ({guidance?.business_facts?.length})
            </CardTitle>
            <CardDescription>
              Topic-relevant facts are retrieved automatically for each post. Remove any fact you do not want used.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {guidance?.business_facts?.map((f) => (
              <div
                key={f.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {f.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{f.source_label}</span>
                  </div>
                  <p className="text-foreground">{f.text}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove fact"
                  onClick={() => onRemoveFact(f.id)}
                >
                  <XIcon className="size-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
