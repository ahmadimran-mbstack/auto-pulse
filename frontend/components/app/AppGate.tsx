"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppUser } from "@/components/providers/user-provider";
import { queryClient, useMeQuery } from "@/lib/queries";
import { getPostAuthRoute, performSuspendedSignOut } from "@/lib/auth/post-auth";

export function AppGate({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me, isLoading } = useMeQuery(user.id);

  React.useEffect(() => {
    if (isLoading || !me) return;
    const target = getPostAuthRoute(me);
    if (me.status === "suspended") {
      performSuspendedSignOut(() => queryClient.clear()).then(() => {
        router.replace(target);
      });
      return;
    }
    // Admins may stay on /app when navigating via "Back to app"
    if (!me.is_admin && target !== "/app" && !pathname.startsWith(target)) {
      router.replace(target);
    }
  }, [isLoading, me, pathname, router]);

  if (isLoading || !me || me.status === "suspended" || (!me.is_admin && getPostAuthRoute(me) !== "/app")) {
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
