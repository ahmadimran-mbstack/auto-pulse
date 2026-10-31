"use client";

import * as React from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { signOutAction } from "@/app/app/actions";
import { clearClientState } from "@/lib/queries";

export function useSignOut() {
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  const signOut = React.useCallback(async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      // 1. Terminate client-side session via Neon Auth client
      try {
        await authClient.signOut();
      } catch {
        // Continue to server action even if client auth throws
      }

      // 2. Terminate server-side session and expire session cookies
      const result = await signOutAction();
      if (result && !result.success) {
        throw new Error(result.error || "Failed to sign out");
      }

      // 3. Clear all in-memory query cache, auth tokens, and client storage (preserve theme)
      clearClientState();

      // 4. Notify other tabs to sign out
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("autopulse-auth");
          bc.postMessage("logout");
          bc.close();
        }
        localStorage.setItem("autopulse_logout_event", Date.now().toString());
      } catch {
        // Storage or BroadcastChannel may fail in private windows
      }

      // 5. Replace navigation so dashboard is completely removed from history stack
      window.location.replace("/auth/sign-in");
    } catch (err: any) {
      setIsSigningOut(false);
      toast.error(err?.message || "Failed to sign out. Please try again.");
    }
  }, [isSigningOut]);

  return {
    signOut,
    isSigningOut,
  };
}

