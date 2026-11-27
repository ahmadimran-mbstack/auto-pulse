"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppUser } from "@/components/providers/user-provider";
import { queryClient, useMeQuery } from "@/lib/queries";
import { performSuspendedSignOut } from "@/lib/auth/post-auth";

export function AppGate({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: me, isLoading } = useMeQuery(user.id);

  React.useEffect(() => {
    if (!me) return;
    if (me.status === "suspended") {
      performSuspendedSignOut(() => queryClient.clear()).then(() => {
        router.replace("/auth/sign-in?error=suspended");
      });
      return;
    }
    if (!me.is_admin && !me.onboarding_completed) {
      router.replace("/onboarding");
    }
  }, [me, router]);

  if (isLoading || !me || me.status === "suspended" || (!me.is_admin && !me.onboarding_completed)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="space-y-3 w-48">
          <Skeleton className="h-6 w-36 mx-auto" />
          <Skeleton className="h-3 w-48 mx-auto" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
