"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { customizationKeys, listCustomizationVersions } from "@/lib/customization";

interface VersionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivateVersion: (versionId: string) => void;
}

export function VersionHistorySheet({
  open,
  onOpenChange,
  onActivateVersion,
}: VersionHistorySheetProps) {
  const { data: versions, isLoading } = useQuery({
    queryKey: customizationKeys.versions(),
    queryFn: listCustomizationVersions,
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Customization version history</SheetTitle>
          <SheetDescription>
            Every compile creates an immutable snapshot. Roll back anytime.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading versions...</p>
          ) : !versions || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No compiled versions yet.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      v{v.version}
                    </span>
                    {v.is_active && (
                      <Badge variant="success">
                        <CheckCircle2Icon className="size-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {new Date(v.created_at).toLocaleString()}
                  </p>
                  {v.warnings.length > 0 && (
                    <p className="text-xs text-status-warning-fg">
                      {v.warnings.length} warning{v.warnings.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                {!v.is_active && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onActivateVersion(v.id)}
                  >
                    Activate
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
