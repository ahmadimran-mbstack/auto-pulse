"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminMe } from "@/lib/api";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isError, data } = useQuery({
    queryKey: ["admin-me"],
    queryFn: getAdminMe,
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError || !data?.is_admin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page could not be found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold">AutoPulse Admin</span>
          <span className="text-xs text-muted-foreground">{data.email}</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
