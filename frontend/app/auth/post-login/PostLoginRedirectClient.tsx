"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getAdminMe } from "@/lib/api";

export function PostLoginRedirectClient() {
  const router = useRouter();

  React.useEffect(() => {
    let active = true;
    getAdminMe()
      .then((res) => {
        if (!active) return;
        router.replace(res.is_admin ? "/admin" : "/app");
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
