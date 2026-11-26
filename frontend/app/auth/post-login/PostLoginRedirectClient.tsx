"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { resolvePostAuthDestination } from "@/lib/auth/post-auth";

export function PostLoginRedirectClient() {
  const router = useRouter();

  React.useEffect(() => {
    let active = true;
    resolvePostAuthDestination("/app")
      .then((res) => {
        if (!active) return;
        router.refresh();
        window.location.assign(res.ok ? res.destination : "/auth/sign-in");
      })
      .catch(() => {
        if (!active) return;
        router.replace("/app");
      });
    return () => {
      active = false;
    };
  }, [router]);

  return <div className="min-h-screen bg-background" />;
}
