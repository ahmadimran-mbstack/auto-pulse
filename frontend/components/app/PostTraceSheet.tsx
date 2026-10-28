"use client";

import * as React from "react";
import {
  ExternalLinkIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  RotateCcwIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { usePostAgentTraceQuery } from "@/lib/queries";
import type { AgentTrace, FindingTrace, RoundTrace } from "@/types/posts";

interface PostTraceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  postId?: string | null;
  initialTrace?: AgentTrace | null;
}

export function formatExitReason(reason?: string): string {
  switch (reason) {
    case "passed":
      return "Passed style threshold";
    case "max_rounds":
      return "Stopped at the round limit";
    case "no_improvement":
      return "Stopped because it stopped improving";
    case "call_limit_reached":
      return "Stopped at call limit cap";
    default:
      return reason || "Completed";
  }
}

// Highlights text safely by slicing with start and end offsets without dangerouslySetInnerHTML
function SlicedFlaggedText({
  text,
  findings,
}: {
  text: string;
  findings: FindingTrace[];
}) {
  if (!text) return null;
  if (!findings || findings.length === 0) {
    return <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{text}</p>;
  }

  // Sort findings by start offset ascending
  const sorted = [...findings].sort((a, b) => a.start - b.start);
  const elements: React.ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((finding, index) => {
    // Skip invalid or out-of-order ranges
    if (finding.start < cursor || finding.start >= text.length) return;
    const end = Math.min(Math.max(finding.start, finding.end), text.length);
    if (end <= finding.start) return;

    // Push clean text before the flagged segment
    if (finding.start > cursor) {
      elements.push(
        <span key={`clean-${cursor}-${finding.start}`}>
          {text.slice(cursor, finding.start)}
        </span>
      );
    }

    // Flagged span
    const flagged = text.slice(finding.start, end);
    elements.push(
      <Tooltip key={`finding-${index}-${finding.start}`}>
        <TooltipTrigger asChild>
          <button
            type="button"
            tabIndex={0}
            aria-label={`Flagged pattern: ${finding.pattern}. Press Enter to view explanation.`}
            className="underline decoration-dotted decoration-foreground/60 bg-muted/80 text-foreground px-0.5 rounded cursor-help font-inherit text-inherit text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {flagged}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs space-y-1.5 p-3 text-xs z-50">
          <p className="font-semibold text-foreground">{finding.pattern}</p>
          <p className="text-muted-foreground leading-normal">{finding.why}</p>
          {finding.fix_hint && (
            <p className="text-foreground/90 pt-1.5 border-t border-border/80">
              <span className="font-medium text-foreground">Suggested fix: </span>
              {finding.fix_hint}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );

    cursor = end;
  });

  // Push trailing text after last finding
  if (cursor < text.length) {
    elements.push(
      <span key={`clean-tail-${cursor}`}>{text.slice(cursor)}</span>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed break-words">
        {elements}
      </div>
    </TooltipProvider>
  );
}

export function PostTraceSheet({
  open,
  onOpenChange,
  userId = "current",
  postId,
  initialTrace,
}: PostTraceSheetProps) {
  const [copied, setCopied] = React.useState(false);

  // If initialTrace is provided (e.g. from playground), use it directly; otherwise query server
  const shouldQuery = !initialTrace && !!postId;
  const { data, isLoading, isError, error, refetch } = usePostAgentTraceQuery(
    userId,
    postId || ""
  );

  const trace: AgentTrace | null = initialTrace || data?.trace || null;

  const handleCopyText = (text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finalScore = trace?.final?.score ?? trace?.final_score ?? null;
  const isNeedsReview = trace?.final?.needs_review ?? trace?.needs_review ?? false;
  const exitReason = trace?.final?.reason ?? trace?.exit_reason;
  const finalText = trace?.final?.text ?? trace?.final?.post_text ?? trace?.rounds?.[trace?.rounds?.length - 1]?.text ?? trace?.rounds?.[trace?.rounds?.length - 1]?.post_text ?? "";

  const gtm = trace?.gtm || trace?.gtm_brief;
  const finder = trace?.finder;
  const gtmReview = trace?.gtm_review;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl md:max-w-3xl overflow-y-auto p-0 flex flex-col bg-background"
      >
        <SheetHeader className="p-6 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <SheetTitle className="text-base sm:text-lg font-semibold tracking-tight">
                How this was written
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                Audit trace from the four cooperating writing agents.
              </SheetDescription>
            </div>
            {finalScore !== null && (
              <Badge
                variant={isNeedsReview || finalScore >= 15 ? "warning" : "secondary"}
                className="tabular-nums whitespace-nowrap"
              >
                AI-slop check {finalScore} of 100, lower is better
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="p-6 flex-1">
          {isLoading && shouldQuery ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : isError && shouldQuery ? (
            <div className="p-8 text-center space-y-3">
              <AlertTriangleIcon className="size-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Could not load the audit trace.
              </p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Failed to load trace"}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
                <RotateCcwIcon className="size-3.5" />
                <span>Retry</span>
              </Button>
            </div>
          ) : !trace ? (
            <Card className="border-dashed bg-muted/30">
              <CardContent className="p-8 text-center space-y-2">
                <InfoIcon className="size-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  This post was made before the writing agents.
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Only posts generated with our multi-agent write and rewrite loop include step-by-step audit traces.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="result" className="space-y-6">
              <TabsList className="grid grid-cols-3 w-full bg-muted p-1">
                <TabsTrigger value="result" className="text-xs">
                  Result
                </TabsTrigger>
                <TabsTrigger value="rounds" className="text-xs">
                  Rounds ({trace.rounds?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="strategy" className="text-xs">
                  Strategy
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: RESULT */}
              <TabsContent value="result" className="space-y-4 focus-visible:outline-none">
                <Card className="border-border bg-card">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 border-b border-border">
                    <div className="space-y-1">
                      <CardTitle className="text-sm font-medium">Final Selected Draft</CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        {finalScore !== null && (
                          <Badge
                            variant={isNeedsReview || finalScore >= 15 ? "warning" : "secondary"}
                            className="text-xs tabular-nums"
                          >
                            AI-slop check {finalScore} of 100, lower is better
                          </Badge>
                        )}
                        {isNeedsReview && (
                          <Badge variant="outline" className="text-xs">
                            Needs review
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Reason: {formatExitReason(exitReason)}
                        </span>
                      </div>
                    </div>
                    {finalText && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyText(finalText)}
                        className="size-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Copy post text"
                      >
                        {copied ? (
                          <CheckIcon className="size-4 text-primary" />
                        ) : (
                          <CopyIcon className="size-4" />
                        )}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed break-words">
                      {finalText || "No text available."}
                    </p>
                  </CardContent>
                </Card>

                {/* Mandatory customer-facing style check disclaimer */}
                <p className="text-xs text-muted-foreground leading-normal">
                  This is our own style check, not a guarantee against any outside AI detector.
                </p>
              </TabsContent>

              {/* TAB 2: ROUNDS */}
              <TabsContent value="rounds" className="space-y-4 focus-visible:outline-none">
                <Accordion
                  type="single"
                  collapsible
                  defaultValue="round-0"
                  className="space-y-3"
                >
                  {(trace.rounds || []).map((roundEntry, idx) => {
                    const roundScore = roundEntry.score ?? roundEntry.final_score ?? 0;
                    const subscores = roundEntry.subscores || roundEntry.sub_scores;
                    const roundText = roundEntry.text || roundEntry.post_text || "";

                    return (
                      <AccordionItem
                        key={`round-${roundEntry.round ?? idx}`}
                        value={`round-${roundEntry.round ?? idx}`}
                        className="border border-border rounded-lg bg-card px-4 overflow-hidden"
                      >
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center justify-between w-full pr-4 text-left">
                            <span className="text-sm font-medium text-foreground">
                              Round {roundEntry.round}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={roundScore >= 15 ? "warning" : "secondary"}
                                className="text-xs tabular-nums"
                              >
                                Score: {roundScore} / 100
                              </Badge>
                              {roundEntry.findings?.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {roundEntry.findings.length} flagged
                                </span>
                              )}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4 space-y-4 border-t border-border">
                          {/* 5 Sub-Scores with Progress Bars */}
                          {subscores && (
                            <div className="p-3 rounded-md bg-muted/40 space-y-2.5">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Sub-scores (Lower is better)
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                {[
                                  { label: "Vocabulary", val: subscores.vocabulary },
                                  { label: "Structure", val: subscores.structure },
                                  { label: "Rhythm", val: subscores.rhythm },
                                  { label: "Specificity", val: subscores.specificity },
                                  { label: "Tone", val: subscores.tone },
                                ].map((item) => (
                                  <div key={item.label} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">{item.label}</span>
                                      <span className="font-medium tabular-nums">{item.val} / 100</span>
                                    </div>
                                    <Progress value={item.val} className="h-1.5" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Flagged Draft text with dotted underline and tooltips */}
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Draft text with flagged tells
                            </p>
                            <div className="p-3 rounded-md border border-border bg-background">
                              <SlicedFlaggedText
                                text={roundText}
                                findings={roundEntry.findings || []}
                              />
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </TabsContent>

              {/* TAB 3: STRATEGY */}
              <TabsContent value="strategy" className="space-y-4 focus-visible:outline-none">
                {/* 1. Post Finder Topic Strategy Card */}
                {finder && (
                  <Card className="border-border bg-card">
                    <CardHeader className="pb-3 border-b border-border">
                      <CardTitle className="text-sm font-medium">Topic Selection & Angle</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3 text-xs">
                      <div>
                        <span className="text-muted-foreground font-medium">Topic: </span>
                        <span className="font-semibold text-foreground">{finder.topic}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground font-medium">Angle: </span>
                        <span className="text-foreground">{finder.angle}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground font-medium">Post Format: </span>
                          <span className="text-foreground">{finder.post_format}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground font-medium">Hook Type: </span>
                          <span className="text-foreground">{finder.hook_type}</span>
                        </div>
                      </div>
                      {finder.why_now && (
                        <div>
                          <span className="text-muted-foreground font-medium">Why Now: </span>
                          <span className="text-foreground">{finder.why_now}</span>
                        </div>
                      )}
                      {finder.avoided && finder.avoided.length > 0 && (
                        <div>
                          <span className="text-muted-foreground font-medium">Avoided repeating: </span>
                          <span className="text-foreground">{finder.avoided.join(", ")}</span>
                        </div>
                      )}
                      {finder.sources && finder.sources.length > 0 && (
                        <div className="pt-1">
                          <span className="text-muted-foreground font-medium">Sources: </span>
                          <ul className="list-disc list-inside space-y-1 mt-1">
                            {finder.sources.map((s, idx) => (
                              <li key={idx} className="truncate">
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  <span>{s.title || s.url}</span>
                                  <ExternalLinkIcon className="size-3" />
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 2. GTM Hook Plan & Review Card */}
                {gtm && (
                  <Card className="border-border bg-card">
                    <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-medium">Hook Plan & GTM Review</CardTitle>
                      {gtmReview && (
                        <Badge variant="outline" className="text-xs tabular-nums">
                          Hook strength: {gtmReview.hook_strength} / 10
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3 text-xs">
                      <div>
                        <span className="text-muted-foreground font-medium">Chosen Hook: </span>
                        <p className="font-semibold text-foreground mt-0.5">{gtm.chosen_hook}</p>
                      </div>

                      {gtm.hook_options && gtm.hook_options.length > 0 && (
                        <div>
                          <span className="text-muted-foreground font-medium">Other Hook Options: </span>
                          <ul className="list-disc list-inside space-y-1 mt-1 text-muted-foreground">
                            {gtm.hook_options.map((h, idx) => (
                              <li key={idx} className="text-foreground/90">{h}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(gtm.structure || gtm.structure_lines) && (
                        <div>
                          <span className="text-muted-foreground font-medium">Structure Steps: </span>
                          <ol className="list-decimal list-inside space-y-1 mt-1 text-muted-foreground">
                            {(gtm.structure || gtm.structure_lines || []).map((step, idx) => (
                              <li key={idx} className="text-foreground/90">{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {(gtm.cta || gtm.ending_strategy) && (
                        <div>
                          <span className="text-muted-foreground font-medium">Ending Command: </span>
                          <span className="text-foreground">{gtm.cta || gtm.ending_strategy}</span>
                        </div>
                      )}

                      {gtm.notes && gtm.notes.length > 0 && (
                        <div>
                          <span className="text-muted-foreground font-medium">Notes: </span>
                          <ul className="list-disc list-inside space-y-1 mt-1 text-muted-foreground">
                            {gtm.notes.map((n, idx) => (
                              <li key={idx}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {gtmReview && (gtmReview.notes || gtmReview.review_notes) && (
                        <div className="pt-2 border-t border-border">
                          <span className="text-muted-foreground font-medium">GTM Review Feedback: </span>
                          <ul className="list-disc list-inside space-y-1 mt-1 text-muted-foreground">
                            {(gtmReview.notes || gtmReview.review_notes || []).map((rn, idx) => (
                              <li key={idx}>{rn}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
