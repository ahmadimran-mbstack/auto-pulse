"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/app/Section";
import { instructionsSchema, type InstructionsValues } from "@/lib/customization-schemas";
import type { DetectedConstraint } from "@/types/customization";

interface InstructionsSectionProps {
  initialInstructions: string;
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

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSave(values.custom_instructions);
  });

  return (
    <Section
      title="Custom instructions"
      description="Direct instructions for the writing agent. These take priority over playbook and voice defaults (within platform safety limits)."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Textarea
            rows={8}
            maxLength={4000}
            placeholder={
              "Examples:\n- Always write in British English.\n- Keep posts under 900 characters.\n- Never mention competitors by name.\n- Always end with a question for engineering leaders."
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
            <p className="text-xs font-medium text-muted-foreground">Detected hard constraints</p>
            <div className="flex flex-wrap gap-2">
              {detectedConstraints.map((c, idx) => (
                <Badge key={idx} variant="secondary">
                  {formatConstraint(c)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : "Save instructions"}
        </Button>
      </form>
    </Section>
  );
}
