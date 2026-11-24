import { Suspense } from "react";
import { CheckoutClient } from "./CheckoutClient";

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto">
          <div className="h-96 rounded-lg bg-muted/40 animate-pulse" />
        </div>
      }
    >
      <CheckoutClient />
    </Suspense>
  );
}
