import type { Metadata } from "next";
import { Suspense } from "react";
import { LinkedInCallbackClient } from "./LinkedInCallbackClient";

// Ensure referrer policy is set to no-referrer so the authorization code is never leaked to external sites
export const metadata: Metadata = {
  title: "Connecting LinkedIn | AutoPulse",
  referrer: "no-referrer",
};

export default function LinkedInCallbackPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-12">
      <Suspense
        fallback={
          <div className="w-full max-w-[480px] p-8 rounded-[16px] bg-surface border border-line text-center animate-pulse">
            <div className="w-10 h-10 mx-auto rounded-full bg-slate-200 mb-4" />
            <div className="w-48 h-5 bg-slate-200 mx-auto rounded mb-2" />
            <div className="w-64 h-3 bg-slate-100 mx-auto rounded" />
          </div>
        }
      >
        <LinkedInCallbackClient />
      </Suspense>
    </div>
  );
}
