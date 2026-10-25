import type {
  ConnectionDisplayState,
  SocialConnection,
} from "@/types/connections";

// Computes the visual presentation state of a LinkedIn connection
export function getConnectionDisplayState(
  connection: SocialConnection | null | undefined,
  now: Date = new Date()
): ConnectionDisplayState {
  if (!connection) {
    return "not_connected";
  }

  // Check if status is revoked or explicitly marked expired
  if (connection.status === "expired" || connection.status === "revoked") {
    return "expired";
  }

  // Check whether expires_at timestamp has passed
  const expiryTime = new Date(connection.expires_at).getTime();
  if (expiryTime <= now.getTime() || connection.days_left <= 0) {
    return "expired";
  }

  // Expiring soon if 7 days or fewer remain
  if (connection.days_left <= 7) {
    return "expiring_soon";
  }

  return "connected";
}

export interface ConnectionUiInfo {
  badgeLabel: string;
  badgeVariant: "neutral" | "draft" | "approved" | "published" | "danger";
  actionLabel: "Connect" | "Reconnect" | "Disconnect";
  description: string;
}

// Maps connection state to UI display attributes
export function getConnectionUiInfo(state: ConnectionDisplayState): ConnectionUiInfo {
  switch (state) {
    case "connected":
      return {
        badgeLabel: "Connected",
        badgeVariant: "published",
        actionLabel: "Disconnect",
        description: "Your LinkedIn account is connected and ready to publish approved posts.",
      };
    case "expiring_soon":
      return {
        badgeLabel: "Expiring soon",
        badgeVariant: "draft",
        actionLabel: "Reconnect",
        description: "Your LinkedIn connection will expire soon. Reconnect now to prevent posting delays.",
      };
    case "expired":
      return {
        badgeLabel: "Expired",
        badgeVariant: "danger",
        actionLabel: "Reconnect",
        description: "Your LinkedIn connection has expired. Reconnect to resume publishing.",
      };
    case "not_connected":
    default:
      return {
        badgeLabel: "Not connected",
        badgeVariant: "neutral",
        actionLabel: "Connect",
        description: "Connect your LinkedIn profile to publish approved posts automatically.",
      };
  }
}

export interface ParsedCallbackParams {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
}

// Parses OAuth callback query parameters from a URL or query string
export function parseCallbackParams(
  queryOrUrl: string | URLSearchParams
): ParsedCallbackParams {
  let searchParams: URLSearchParams;

  if (typeof queryOrUrl === "string") {
    // If a full URL is passed, extract only the search query component
    const questionIndex = queryOrUrl.indexOf("?");
    const queryString =
      questionIndex !== -1 ? queryOrUrl.slice(questionIndex + 1) : queryOrUrl;
    searchParams = new URLSearchParams(queryString);
  } else {
    searchParams = queryOrUrl;
  }

  return {
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    error: searchParams.get("error"),
    errorDescription:
      searchParams.get("error_description") ||
      searchParams.get("errorDescription"),
  };
}

// Formats an ISO expiration date string into the user's localized date format
export function formatConnectionExpiryDate(
  isoDateString: string,
  locale?: string
): string {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) {
      return isoDateString;
    }
    return date.toLocaleDateString(locale || undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoDateString;
  }
}
