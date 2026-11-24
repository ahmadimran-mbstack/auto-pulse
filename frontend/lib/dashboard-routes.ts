export interface DashboardRouteEntry {
  prefix: string;
  title: string;
  exact?: boolean;
}

/**
 * Central config mapping dashboard routes to their top bar and browser tab titles.
 * Exact routes (like /app) match only themselves; all other routes match by longest path prefix.
 */
export const DASHBOARD_ROUTES: DashboardRouteEntry[] = [
  { prefix: "/app", title: "Overview", exact: true },
  { prefix: "/dashboard", title: "Overview", exact: true },
  { prefix: "/app/analytics", title: "Analytics" },
  { prefix: "/dashboard/analytics", title: "Analytics" },
  { prefix: "/app/posts", title: "Posts" },
  { prefix: "/dashboard/posts", title: "Posts" },
  { prefix: "/app/playground", title: "Playground" },
  { prefix: "/dashboard/playground", title: "Playground" },
  { prefix: "/app/test-lab", title: "Test Lab" },
  { prefix: "/dashboard/test-lab", title: "Test Lab" },
  { prefix: "/app/customize", title: "Customize" },
  { prefix: "/dashboard/customize", title: "Customize" },
  { prefix: "/app/connections", title: "Connections" },
  { prefix: "/dashboard/connections", title: "Connections" },
  { prefix: "/app/billing", title: "Billing" },
  { prefix: "/dashboard/billing", title: "Billing" },
  { prefix: "/app/settings", title: "Settings" },
  { prefix: "/dashboard/settings", title: "Settings" },
  { prefix: "/app/onboarding", title: "Onboarding" },
  { prefix: "/dashboard/onboarding", title: "Onboarding" },
  { prefix: "/app/admin", title: "Admin" },
  { prefix: "/dashboard/admin", title: "Admin" },
  { prefix: "/app/checkout", title: "Checkout" },
  { prefix: "/dashboard/checkout", title: "Checkout" },
];

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function titleFromLastSegment(pathname: string): string {
  const segments = normalizePath(pathname).split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return "Dashboard";
  return last
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Resolve the page title for a dashboard pathname (and optional search params).
 * Matches exact routes first, then longest path prefix, then falls back to the last path segment.
 * Never falls back to "Overview".
 */
export function getDashboardPageTitle(
  pathname: string,
  searchParams?: { get: (key: string) => string | null } | null
): string {
  const normalized = normalizePath(pathname);

  // Special case: Test Lab tab inside /app/playground
  if (
    (normalized === "/app/playground" || normalized === "/dashboard/playground") &&
    searchParams?.get("tab") === "test-lab"
  ) {
    return "Test Lab";
  }

  let bestMatch: DashboardRouteEntry | null = null;
  for (const entry of DASHBOARD_ROUTES) {
    const prefix = normalizePath(entry.prefix);
    if (entry.exact) {
      if (normalized === prefix) {
        return entry.title;
      }
      continue;
    }
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      if (!bestMatch || prefix.length > normalizePath(bestMatch.prefix).length) {
        bestMatch = entry;
      }
    }
  }

  if (bestMatch) {
    return bestMatch.title;
  }

  return titleFromLastSegment(normalized);
}

/**
 * Check whether a sidebar navigation item is active for the given pathname.
 */
export function isSidebarRouteActive(pathname: string, itemUrl: string, exact = false): boolean {
  const normalizedPath = normalizePath(pathname);
  const normalizedUrl = normalizePath(itemUrl);
  if (exact) {
    return normalizedPath === normalizedUrl;
  }
  return normalizedPath === normalizedUrl || normalizedPath.startsWith(`${normalizedUrl}/`);
}
