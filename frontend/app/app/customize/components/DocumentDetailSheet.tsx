"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PinIcon, EyeOffIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/StatusBadge";
import { customizationKeys, getCustomizationDocument } from "@/lib/customization";

interface DocumentDetailSheetProps {
  docId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSamplePin?: (sampleId: string, pinned: boolean) => void;
  onToggleSampleExclude?: (sampleId: string, excluded: boolean) => void;
}

export function DocumentDetailSheet({
  docId,
  open,
  onOpenChange,
  onToggleSamplePin,
  onToggleSampleExclude,
}: DocumentDetailSheetProps) {
  const { data, isLoading } = useQuery({
    queryKey: customizationKeys.document(docId ?? ""),
    queryFn: () => getCustomizationDocument(docId!),
    enabled: Boolean(open && docId),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.title ?? "Document details"}</SheetTitle>
          <SheetDescription>
            {data ? `${data.kind.replace("_", " ")} · ${data.source_type}` : "Loading..."}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              {data.char_count ? (
                <Badge variant="outline" className="tabular-nums">
                  {data.char_count.toLocaleString()} chars
                </Badge>
              ) : null}
              {data.page_count ? (
                <Badge variant="outline" className="tabular-nums">
                  {data.page_count} pages
                </Badge>
              ) : null}
            </div>

            {data.facts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Extracted items ({data.facts.length})
                </h3>
                <div className="space-y-2">
                  {data.facts.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {f.category}
                        </Badge>
                        {f.is_core && <Badge variant="outline">Core</Badge>}
                      </div>
                      <p className="text-foreground">{f.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.samples.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Detected posts ({data.samples.length})
                </h3>
                <div className="space-y-2">
                  {data.samples.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-md border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            #{s.ordinal + 1} · {s.char_count} chars
                          </span>
                          {s.quality_flag && (
                            <Badge variant="warning">{s.quality_flag}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {onToggleSamplePin && (
                            <Button
                              variant={s.pinned ? "default" : "ghost"}
                              size="sm"
                              onClick={() => onToggleSamplePin(s.id, !s.pinned)}
                            >
                              <PinIcon className="size-3.5 mr-1" />
                              {s.pinned ? "Pinned" : "Pin"}
                            </Button>
                          )}
                          {onToggleSampleExclude && (
                            <Button
                              variant={s.excluded ? "destructive" : "ghost"}
                              size="sm"
                              onClick={() => onToggleSampleExclude(s.id, !s.excluded)}
                            >
                              <EyeOffIcon className="size-3.5 mr-1" />
                              {s.excluded ? "Excluded" : "Exclude"}
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-4">
                        {s.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.text_preview && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Extracted text preview</h3>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {data.text_preview}
                </pre>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
