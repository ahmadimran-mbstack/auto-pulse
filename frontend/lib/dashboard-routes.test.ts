import { describe, expect, it } from "vitest";
import { getDashboardPageTitle, isSidebarRouteActive } from "./dashboard-routes";

describe("getDashboardPageTitle", () => {
  it("maps /app and /dashboard exact roots to Overview", () => {
    expect(getDashboardPageTitle("/app")).toBe("Overview");
    expect(getDashboardPageTitle("/app/")).toBe("Overview");
    expect(getDashboardPageTitle("/dashboard")).toBe("Overview");
  });

  it("maps all known dashboard routes and nested paths by longest prefix", () => {
    expect(getDashboardPageTitle("/app/analytics")).toBe("Analytics");
    expect(getDashboardPageTitle("/app/posts")).toBe("Posts");
    expect(getDashboardPageTitle("/app/posts/123")).toBe("Posts");
    expect(getDashboardPageTitle("/app/playground")).toBe("Playground");
    expect(getDashboardPageTitle("/app/playground", new URLSearchParams("tab=test-lab"))).toBe("Test Lab");
    expect(getDashboardPageTitle("/app/test-lab")).toBe("Test Lab");
    expect(getDashboardPageTitle("/app/customize")).toBe("Customize");
    expect(getDashboardPageTitle("/app/connections")).toBe("Connections");
    expect(getDashboardPageTitle("/app/connections/linkedin/callback")).toBe("Connections");
    expect(getDashboardPageTitle("/app/billing")).toBe("Billing");
    expect(getDashboardPageTitle("/dashboard/billing/anything")).toBe("Billing");
    expect(getDashboardPageTitle("/app/settings")).toBe("Settings");
    expect(getDashboardPageTitle("/app/onboarding/step-1")).toBe("Onboarding");
    expect(getDashboardPageTitle("/app/admin/users")).toBe("Admin");
    expect(getDashboardPageTitle("/app/checkout/success")).toBe("Checkout");
  });

  it("never falls back to Overview for unknown routes", () => {
    expect(getDashboardPageTitle("/app/custom-report")).toBe("Custom Report");
    expect(getDashboardPageTitle("/dashboard/team_members")).toBe("Team Members");
    expect(getDashboardPageTitle("/app/unknown")).toBe("Unknown");
  });
});

describe("isSidebarRouteActive", () => {
  it("handles exact and prefix matching cleanly", () => {
    expect(isSidebarRouteActive("/app", "/app", true)).toBe(true);
    expect(isSidebarRouteActive("/app/customize", "/app", true)).toBe(false);
    expect(isSidebarRouteActive("/app/customize", "/app/customize", false)).toBe(true);
    expect(isSidebarRouteActive("/app/billing/invoices", "/app/billing", false)).toBe(true);
    expect(isSidebarRouteActive("/app/settings-other", "/app/settings", false)).toBe(false);
  });
});
