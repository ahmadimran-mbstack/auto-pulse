"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

// Renders the shared dashboard Toaster everywhere except /auth routes,
// so auth pages can mount their own dark-only Toaster without duplicating it.
export function RootToaster() {
  const pathname = usePathname();

  // Skip the global Toaster on auth routes because AuthLayout mounts AuthToaster
  if (pathname?.startsWith("/auth")) {
    return null;
  }

  return <Toaster />;
}
