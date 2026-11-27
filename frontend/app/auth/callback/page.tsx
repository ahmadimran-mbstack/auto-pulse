"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchMeWithSessionToken,
  getPostAuthRoute,
  performSuspendedSignOut,
} from "@/lib/auth/post-auth";
import { queryClient, queryKeys } from "@/lib/queries";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    fetchMeWithSessionToken()
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          queryClient.setQueryData(queryKeys.me(res.me.id), res.me);
          router.replace(getPostAuthRoute(res.me));
          return;
        }
        if (res.suspended) {
          await performSuspendedSignOut(() => queryClient.clear());
          if (!active) return;
          router.replace("/auth/sign-in?error=suspended");
          return;
        }
        router.replace("/auth/sign-in");
      })
      .catch(() => {
        if (active) router.replace("/auth/sign-in");
      });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="space-y-3 w-48">
        <Skeleton className="h-6 w-36 mx-auto" />
        <Skeleton className="h-3 w-48 mx-auto" />
      </div>
    </div>
  );
}
