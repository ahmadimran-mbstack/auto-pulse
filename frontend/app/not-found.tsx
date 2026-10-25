import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// 404 Not Found page styled with AutoPulse design tokens
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md p-8 sm:p-10 text-left space-y-5">
        <div className="size-10 rounded-md bg-secondary border border-border flex items-center justify-center text-primary font-mono text-caption font-bold">
          404
        </div>
        <div>
          <h1 className="text-title font-display text-foreground mb-2">
            Page not found
          </h1>
          <p className="text-body text-muted-foreground leading-relaxed">
            The page you requested does not exist or may have been moved to another location.
          </p>
        </div>
        <div className="pt-2">
          <Button asChild>
            <Link href="/">
              Return to home
            </Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
