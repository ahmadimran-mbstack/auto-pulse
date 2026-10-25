import type { Metadata } from "next";
import { Suspense } from "react";
import { LinkedInCallbackClient } from "./LinkedInCallbackClient";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Ensure referrer policy is set to no-referrer so the authorization code is never leaked to external sites
export const metadata: Metadata = {
  title: "Connecting LinkedIn | AutoPulse",
  referrer: "no-referrer",
};

export default function LinkedInCallbackPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 sm:px-6 py-12">
      <Suspense
        fallback={
          <Card className="w-full max-w-md p-8 text-center space-y-4">
            <Skeleton className="size-10 mx-auto rounded-full" />
            <Skeleton className="w-48 h-5 mx-auto" />
            <Skeleton className="w-64 h-4 mx-auto" />
          </Card>
        }
      >
        <LinkedInCallbackClient />
      </Suspense>
    </div>
  );
}
