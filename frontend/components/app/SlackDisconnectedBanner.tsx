"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSlackStatusQuery } from "@/lib/queries";
import { connectSlack } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PlatformLabel } from "@/components/app/PlatformLabel";

interface SlackDisconnectedBannerProps {
  userId: string;
  className?: string;
}

export function SlackDisconnectedBanner({ userId, className }: SlackDisconnectedBannerProps) {
  const { data: slackStatus } = useSlackStatusQuery(userId);
  const [isReconnecting, setIsReconnecting] = React.useState(false);

  // Only show when status is disconnected AND the user had previously connected Slack
  if (
    slackStatus?.status !== "disconnected" ||
    (!slackStatus.team_id && !slackStatus.last_error)
  ) {
    return null;
  }

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      const res = await connectSlack({ return_to: "dashboard" });
      if (res?.authorize_url) {
        window.location.assign(res.authorize_url);
      } else {
        throw new Error("Missing authorization redirect URL");
      }
    } catch (err) {
      setIsReconnecting(false);
      toast.error(err instanceof Error ? err.message : "Failed to initiate Slack reconnection");
    }
  };

  return (
    <div
      role="alert"
      className={cn(
        "p-4 rounded-lg border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
          <PlatformLabel platform="slack" showName={false} size="sm" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Slack disconnected. Approvals are going to your email.
          </p>
          {slackStatus.last_error && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Reason: {slackStatus.last_error}
            </p>
          )}
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleReconnect}
        disabled={isReconnecting}
        className="shrink-0"
      >
        {isReconnecting ? (
          <>
            <Loader2 className="size-3.5 animate-spin mr-1.5" />
            Connecting...
          </>
        ) : (
          "Reconnect"
        )}
      </Button>
    </div>
  );
}
