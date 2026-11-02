"use client";

import * as React from "react";
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
      // 1. Direct fetch to /api/auth/sign-out route handler with credentials to ensure HTTP Set-Cookie headers
      try {
        await fetch("/api/auth/sign-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
      } catch (fetchErr) {
        console.warn("Direct /api/auth/sign-out fetch warning (proceeding):", fetchErr);
      }

      // 2. Terminate client-side session via Neon Auth client
      try {
        await authClient.signOut();
      } catch (clientErr) {
        console.warn("Client authClient.signOut warning (proceeding with server signout):", clientErr);
      }

      // 3. Terminate server-side session and expire session cookies via Server Action
      try {
        await signOutAction();
      } catch (serverErr) {
        console.warn("Server signOutAction warning (proceeding with local cleanup):", serverErr);
      }

      // 4. Set signed-out flag in client cookie as immediate client-side protection
      try {
        document.cookie = "autopulse_signed_out=true; path=/; max-age=10; SameSite=Lax";
      } catch {
        // Storage or cookie write may fail in restricted contexts
      }

      // 5. Clear all in-memory query cache, auth tokens, and client storage (preserve theme)
      clearClientState();

      // 6. Clear all accessible document cookies on client (preserve autopulse_signed_out sentinel)
      try {
        if (typeof document !== "undefined") {
          const cookiesList = document.cookie.split(";");
          for (const c of cookiesList) {
            const eqPos = c.indexOf("=");
            const name = eqPos > -1 ? c.substring(0, eqPos).trim() : c.trim();
            if (name && name !== "autopulse_signed_out") {
              document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
              if (typeof window !== "undefined") {
                document.cookie = `${name}=; path=/; domain=${window.location.hostname}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
              }
            }
          }
        }
      } catch {
        // Storage or cookie access may be restricted in private windows
      }

      // 7. Notify other tabs to sign out
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
    } catch (err: any) {
      console.error("Sign out process error:", err);
    } finally {
      // 8. Hard redirect to auth sign-in page to ensure fresh rendering and clean history
      window.location.href = "/auth/sign-in";
    }
  }, [isSigningOut]);

  return {
    signOut,
    isSigningOut,
  };
}

