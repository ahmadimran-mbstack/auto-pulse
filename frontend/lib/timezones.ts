// Helper to lazily generate the timezone list only when settings are accessed

let cachedTimezones: { value: string; label: string }[] | null = null;

// Lazily computes and caches client timezone list using Intl API
export function getTimezonesLazy(): { value: string; label: string }[] {
  if (cachedTimezones) {
    return cachedTimezones;
  }

  try {
    const zones = Intl.supportedValuesOf("timeZone");
    cachedTimezones = zones.map((tz) => {
      // Format label replacing underscores with spaces
      const formatted = tz.replace(/_/g, " ");
      return {
        value: tz,
        label: formatted,
      };
    });
  } catch {
    // Fallback for older browsers
    const commonZones = [
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Europe/London",
      "Europe/Paris",
      "Asia/Tokyo",
      "Asia/Singapore",
      "Australia/Sydney",
    ];
    cachedTimezones = commonZones.map((tz) => ({
      value: tz,
      label: tz.replace(/_/g, " "),
    }));
  }

  return cachedTimezones;
}
