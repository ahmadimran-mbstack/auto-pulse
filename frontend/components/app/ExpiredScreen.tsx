"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/lib/queries";

export function ExpiredBanner({ userId }: { userId: string }) {
  const { data: ent } = useEntitlements(userId);

  if (!ent || ent.status !== "expired") {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs border-b border-destructive/30 bg-destructive/10">
      <div className="flex items-center gap-2 text-foreground">
        <AlertCircle className="size-3.5 text-destructive shrink-0" />
        <span className="font-medium">Your plan has ended</span>
      </div>
      <Button asChild size="sm" variant="destructive" className="h-7 text-xs">
        <Link href="/pricing">Renew</Link>
      </Button>
    </div>
  );
}
