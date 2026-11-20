"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/app/StatusBadge";
import { instructionsSchema, type InstructionsValues } from "@/lib/customization-schemas";
import { cn } from "@/lib/utils";
import type { DetectedConstraint } from "@/types/customization";

interface InstructionsSectionProps {
  initialInstructions: string;
  mode: "merge" | "replace";
  onModeChange: (mode: "merge" | "replace") => void;
  detectedConstraints: DetectedConstraint[];
  onSave: (instructions: string) => Promise<void>;
}

function formatConstraint(c: DetectedConstraint): string {
  if (c.type === "length_chars") {
    if (c.min && c.max) return `Length: ${c.min}–${c.max} chars`;
    if (c.max) return `Max length: ${c.max} chars`;
    if (c.min) return `Min length: ${c.min} chars`;
  }
  if (c.type === "emoji_policy") return `Emojis: ${c.value}`;
  if (c.type === "hashtag_count") return `Hashtags: ${c.min ?? 0}–${c.max ?? 0}`;
  if (c.type === "question_ending") return `Question ending: ${c.value}`;
  if (c.type === "required_phrase_end") return `Sign-off: "${c.value}"`;
  return `${c.type}: ${c.value ?? ""}`;
}

export function InstructionsSection({
  initialInstructions,
  mode,
  onModeChange,
  detectedConstraints,
  onSave,
}: InstructionsSectionProps) {
  const form = useForm<InstructionsValues>({
    resolver: zodResolver(instructionsSchema),
    defaultValues: { custom_instructions: initialInstructions },
  });

  React.useEffect(() => {
    form.reset({ custom_instructions: initialInstructions });
  }, [initialInstructions, form]);

  const currentVal = form.watch("custom_instructions") ?? "";
  const isDirty = currentVal.trim() !== initialInstructions.trim();
  const saveStatus = form.formState.isSubmitting
    ? "saving"
    : isDirty
      ? "unsaved"
      : "saved";

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSave(values.custom_instructions);
    form.reset({ custom_instructions: values.custom_instructions });
  });

  return (
    <div className="space-y-4">
      <Card className="border border-border bg-card shadow-none rounded-lg">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base font-medium text-foreground">
              Custom instructions
            </CardTitle>
            <CardDescription>
              Direct instructions for the writing agents. These take highest priority over playbooks and defaults.
            </CardDescription>
          </div>
          <StatusBadge status={saveStatus} />
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Textarea
                rows={8}
                maxLength={4000}
                placeholder={
                  "Examples:\n- Never use the word 'journey'.\n- Use a lot of emojis.\n- Keep posts under 900 characters."
                }
                {...form.register("custom_instructions")}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                <span>{currentVal.length} / 4,000 characters</span>
                {form.formState.errors.custom_instructions && (
                  <span className="text-status-danger-fg">
                    {form.formState.errors.custom_instructions.message}
                  </span>
                )}
              </div>
            </div>

            {detectedConstraints.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Detected constraints
                </p>
                <div className="flex flex-wrap gap-2">
                  {detectedConstraints.map((c, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs font-normal">
                      {formatConstraint(c)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" disabled={form.formState.isSubmitting || !isDirty}>
              {form.formState.isSubmitting ? "Saving..." : "Save instructions"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-border bg-card shadow-none rounded-lg">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border">
          <CardTitle className="text-base font-medium text-foreground">
            Playbook mode
          </CardTitle>
          <CardDescription>
            Choose how your uploaded playbooks combine with AutoPulse default rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Playbook mode">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "merge"}
              onClick={() => onModeChange("merge")}
              className={cn(
                "rounded-lg border p-3.5 text-left transition-colors duration-150 cursor-pointer space-y-1",
                mode === "merge"
                  ? "border-foreground bg-muted/50"
                  : "border-border bg-card hover:bg-muted/30"
              )}
            >
              <p className="text-sm font-medium text-foreground">Merge with defaults</p>
              <p className="text-xs text-muted-foreground">
                Your rules win on conflicts; non-conflicting AutoPulse best practices still apply.
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={mode === "replace"}
              onClick={() => onModeChange("replace")}
              className={cn(
                "rounded-lg border p-3.5 text-left transition-colors duration-150 cursor-pointer space-y-1",
                mode === "replace"
                  ? "border-foreground bg-muted/50"
                  : "border-border bg-card hover:bg-muted/30"
              )}
            >
              <p className="text-sm font-medium text-foreground">Replace defaults</p>
              <p className="text-xs text-muted-foreground">
                Use only your playbook rules (fact-grounding and safety rules always apply).
              </p>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
