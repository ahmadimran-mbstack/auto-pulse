import type { Metadata } from "next";
import { ApprovePageClient } from "./ApprovePageClient";

// Public approval page metadata disallowing search crawlers and stripping referrers
export const metadata: Metadata = {
  title: "Review Post | AutoPulse",
  robots: {
    index: false,
    follow: false,
  },
  referrer: "no-referrer",
};

interface ApprovePageProps {
  params: Promise<{ token: string }>;
}

export default async function ApprovePage({ params }: ApprovePageProps) {
  const { token } = await params;
  return <ApprovePageClient token={token} />;
}
