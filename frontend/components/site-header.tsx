"use client";

import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

interface SiteHeaderProps {
  title?: React.ReactNode;
  actions?: React.ReactNode;
}

export function SiteHeader({ title, actions }: SiteHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger className="-ml-1" aria-label="Toggle navigation sidebar" />
        {title && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <div className="text-sm font-medium text-foreground truncate">
              {title}
            </div>
          </>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
