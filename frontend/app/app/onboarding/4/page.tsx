"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2Icon, Loader2Icon, ArrowRightIcon } from "lucide-react";
import { getProfile, connectSlack } from "@/lib/api";
import { useSlackStatusQuery } from "@/lib/queries";
import { OnboardingShell, OnboardingSkeleton } from "../components/OnboardingShell";
import { PlatformLabel } from "@/components/app/PlatformLabel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function OnboardingStep4Page() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Loading and redirection state
  const [loading, setLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Read Slack integration status
  const { data: slackStatus, isLoading: slackLoading, refetch: refetchSlack } = useSlackStatusQuery();

  // Guard: Ensure Steps 1, 2, and 3 are completed
  useEffect(() => {
    let isMounted = true;

    async function checkPrerequisites() {
      try {
        const profile = await getProfile();
        if (!isMounted) return;

        if (!profile.niche_description || (profile.onboarding_step ?? 0) < 1) {
          router.replace("/app/onboarding/1");
          return;
        }

        if (!profile.tone || (profile.onboarding_step ?? 0) < 2) {
          router.replace("/app/onboarding/2");
          return;
        }

        if (!profile.brand_name || (profile.onboarding_step ?? 0) < 3) {
          router.replace("/app/onboarding/3");
          return;
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load profile";
        setGeneralError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkPrerequisites();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Handle return parameters from Slack OAuth redirect (?slack=connected | denied | error)
  useEffect(() => {
    const slackParam = searchParams.get("slack");
    if (!slackParam) return;

    if (slackParam === "connected") {
      toast.success("Slack workspace connected successfully.");
      refetchSlack();
    } else if (slackParam === "denied") {
      toast.error("Slack connection was cancelled.");
    } else if (slackParam === "error") {
      toast.error("Failed to connect Slack workspace. Please try again.");
    }

    // Clean up URL parameters cleanly without triggering a navigation refresh
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams, refetchSlack]);

  // Initiate Slack OAuth flow with return_to set to "onboarding"
  const handleConnectSlack = async () => {
    setIsConnecting(true);
    try {
      const res = await connectSlack({ return_to: "onboarding" });
      if (res.authorize_url) {
        window.location.assign(res.authorize_url);
      } else {
        toast.error("Could not obtain Slack authorization URL.");
        setIsConnecting(false);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start Slack connection."
      );
      setIsConnecting(false);
    }
  };

  const handleContinue = (e?: React.FormEvent) => {
    e?.preventDefault();
    router.push("/app/onboarding/5");
  };

  if (loading || slackLoading) {
    return <OnboardingSkeleton />;
  }

  const isConnected = slackStatus?.status === "connected";

  return (
    <OnboardingShell
      step={4}
      title="How would you like to approve posts?"
      subtitle="Choose how you review drafts before publishing."
      backHref="/app/onboarding/3"
      onSubmit={handleContinue}
      isSaving={false}
      saveButtonText="Continue"
      errorMessage={generalError}
    >
      <div className="space-y-6 text-left">
        {/* Core two-line explanation */}
        <div className="p-4 rounded-lg border border-border bg-card space-y-2">
          <div className="flex items-center gap-2 text-body text-foreground">
            <PlatformLabel platform="email" size="sm" showName={false} />
            <span>Every draft is sent to your email for approval before anything is published.</span>
          </div>
          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            <PlatformLabel platform="slack" size="xs" showName={false} />
            <span>Slack is optional and can be connected here or later in Settings.</span>
          </div>
        </div>

        {/* Slack Connection Card */}
        <Card className="p-6 border border-border bg-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <PlatformLabel platform="slack" size="md" />
                {isConnected && (
                  <Badge variant="approved" className="gap-1 text-xs font-medium">
                    <CheckCircle2Icon className="size-3" />
                    <span>Connected</span>
                  </Badge>
                )}
              </div>

              {isConnected ? (
                <div className="space-y-1 pt-1">
                  <p className="text-sm font-medium text-foreground truncate max-w-md">
                    Connected to workspace:{" "}
                    <span className="font-semibold">{slackStatus?.team_name || "Workspace"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Drafts will be delivered to your Slack channel for approval alongside email.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground max-w-md pt-0.5">
                  Connect your workspace to receive previews, images, and one-click Approve and Reject buttons directly in Slack.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isConnected ? (
                <Button
                  type="button"
                  onClick={handleContinue}
                  className="gap-2"
                >
                  <span>Continue</span>
                  <ArrowRightIcon className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleConnectSlack}
                  disabled={isConnecting}
                  className="gap-2"
                >
                  {isConnecting ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <PlatformLabel platform="slack" showName={false} size="sm" />
                      <span>Connect Slack</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Skip option when Slack is not connected */}
        {!isConnected && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              You can always connect Slack later from Settings &rarr; Connections.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Link href="/app/onboarding/5">
                Skip for now
              </Link>
            </Button>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
}
