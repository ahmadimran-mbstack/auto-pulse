"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon, Share2Icon } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface AccountLinkingPanelProps {
  userEmail: string;
}

export function AccountLinkingPanel({ userEmail }: AccountLinkingPanelProps) {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [isLinking, setIsLinking] = useState(false);
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError === "google_link_failed"
      ? "Google OAuth provider is not configured in your Neon Console. Please add Google Client ID and Secret in your Neon project dashboard under Auth > Providers to enable Google linking."
      : null
  );

  useEffect(() => {
    let isMounted = true;

    async function checkAccounts() {
      try {
        const client = authClient as unknown as {
          listAccounts?: () => Promise<{
            data?: Array<{ provider: string; accountId?: string }>;
            error?: { message?: string };
          }>;
        };

        if (typeof client.listAccounts === "function") {
          const res = await client.listAccounts();
          if (isMounted && res?.data && Array.isArray(res.data)) {
            const hasGoogle = res.data.some((acc) => acc.provider === "google");
            setIsGoogleLinked(hasGoogle);
          }
        }
      } catch {
        // Silently ignore check errors
      }
    }

    checkAccounts();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLinkGoogle = async () => {
    setIsLinking(true);
    setError(null);

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const client = authClient as unknown as {
        linkSocial?: (options: {
          provider: "google";
          callbackURL: string;
          errorCallbackURL?: string;
        }) => Promise<{ error?: { message?: string } }>;
      };

      if (typeof client.linkSocial === "function") {
        const result = await client.linkSocial({
          provider: "google",
          callbackURL: `${origin}/app`,
          errorCallbackURL: `${origin}/app?error=google_link_failed`,
        });

        if (result?.error) {
          const msg =
            result.error.message?.toLowerCase().includes("provider") ||
            result.error.message?.toLowerCase().includes("not configured")
              ? "Google OAuth provider is not enabled in your Neon Console. Please add Google Client ID and Secret in Neon Auth > Providers."
              : result.error.message || "Failed to link Google account.";
          setError(msg);
          setIsLinking(false);
        }
      } else {
        await authClient.signIn.social({
          provider: "google",
          callbackURL: `${origin}/app`,
          newUserCallbackURL: `${origin}/app`,
          errorCallbackURL: `${origin}/app?error=google_link_failed`,
        });
      }
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : "";
      const friendlyMessage =
        rawMessage.toLowerCase().includes("provider") ||
        rawMessage.toLowerCase().includes("not configured") ||
        rawMessage.toLowerCase().includes("oauth")
          ? "Google OAuth provider is not enabled in your Neon Console. To enable Google linking, configure your Google Client ID and Secret in your Neon project under Auth > Providers."
          : rawMessage || "Failed to link Google account. Please ensure Google provider is enabled in Neon console.";
      setError(friendlyMessage);
      setIsLinking(false);
    }
  };

  return (
    <Card className="text-left">
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          Manage identity providers and publishing destinations tied to {userEmail}.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Google Authentication Row */}
        <div className="p-4 rounded-md border border-border bg-muted/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-card border border-border flex items-center justify-center shrink-0 text-foreground font-semibold text-sm">
              G
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Google Sign-In</p>
                {isGoogleLinked && (
                  <Badge variant="approved">
                    Connected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isGoogleLinked
                  ? "Your Google account is linked and active."
                  : "Link to sign in seamlessly with your Google workspace identity."}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant={isGoogleLinked ? "secondary" : "outline"}
            size="sm"
            onClick={handleLinkGoogle}
            disabled={isLinking || isGoogleLinked}
            className="shrink-0"
          >
            {isLinking && <Loader2Icon className="size-3.5 animate-spin mr-1.5" />}
            <span>
              {isGoogleLinked
                ? "Connected"
                : isLinking
                ? "Connecting..."
                : "Link Google Account"}
            </span>
          </Button>
        </div>

        {/* LinkedIn Destination Row */}
        <div className="p-4 rounded-md border border-border bg-muted/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-card border border-border flex items-center justify-center shrink-0 text-primary">
              <Share2Icon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">LinkedIn Publishing Channel</p>
                <Badge variant="approved">
                  Ready for Setup
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Requires official OAuth approval before drafts can be dispatched.
              </p>
            </div>
          </div>

          <span className="text-xs text-muted-foreground font-medium self-center sm:self-auto">
            Configured during onboarding
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-md bg-status-danger-bg text-status-danger-fg text-xs leading-relaxed border border-destructive/20"
          >
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
