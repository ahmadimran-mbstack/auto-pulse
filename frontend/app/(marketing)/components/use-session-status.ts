"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { getMyEntitlements } from "@/lib/api";

// Checks client-side whether a verified session exists without making the landing page dynamic
export function useSessionStatus() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<string | undefined>(undefined);
  const [currentStatus, setCurrentStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    authClient
      .getSession()
      .then(async (res) => {
        if (!active) return;
        const user = (res as { data?: { user?: { id?: string } } } | null)?.data?.user;
        const signedIn = Boolean(user?.id);
        setIsSignedIn(signedIn);
        if (signedIn) {
          const ent = await getMyEntitlements().catch(() => null);
          if (!active || !ent) return;
          setCurrentPlanId(ent.plan_id);
          setCurrentStatus(ent.status);
        }
      })
      .catch(() => {
        if (active) {
          setIsSignedIn(false);
          setCurrentPlanId(undefined);
          setCurrentStatus(undefined);
        }
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return { isLoaded, isSignedIn, currentPlanId, currentStatus };
}

