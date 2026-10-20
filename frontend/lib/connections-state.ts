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
