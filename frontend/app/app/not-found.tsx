import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";

// 404 Not Found state inside the /app shell
export default function AppNotFound() {
  return (
    <div className="p-6 md:p-8 space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="Page not found"
        description="The page or resource you are looking for does not exist in AutoPulse."
      />

      <EmptyState
        message="The page or post you requested could not be found. It may have been deleted or moved."
        action={
          <Button asChild size="sm">
            <Link href="/app">
              Return to overview
            </Link>
          </Button>
        }
      />
    </div>
  );
}
