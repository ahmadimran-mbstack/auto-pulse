"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";

// Checks client-side whether a verified session exists without making the landing page dynamic
export function useSessionStatus() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    authClient
      .getSession()
      .then((res) => {
        if (!active) return;
        const user = (res as { data?: { user?: { id?: string } } } | null)?.data?.user;
        setIsSignedIn(Boolean(user?.id));
      })
      .catch(() => {
        if (active) setIsSignedIn(false);
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return { isLoaded, isSignedIn };
}

