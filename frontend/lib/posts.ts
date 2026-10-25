import type { PostStatus } from "@/types/posts";

// UI configuration for a status chip
export interface StatusChipConfig {
  label: string;
  className: string;
  hasCheckIcon?: boolean;
}

// Action type indicating which UI action to present on publication failure
export type PublicationAction =
  | "reconnect"
  | "confirm_retry"
  | "retry"
  | "auto_retry"
  | "none";

export interface PublicationErrorInfo {
  message: string;
  action: PublicationAction;
  isWarning?: boolean;
}

export type PostsTabFilter =
  | "all"
  | "needs_approval"
  | "scheduled"
  | "published"
  | "problems";

// Maps UI tab filter identifiers to backend query status parameters
export function mapTabToStatusFilter(tab: PostsTabFilter): string | undefined {
  switch (tab) {
    case "needs_approval":
      return "awaiting_approval";
    case "scheduled":
      return "approved";
    case "published":
      return "published";
    case "problems":
      return "failed,rejected,expired";
    case "all":
    default:
      return undefined;
  }
}

// Maps post statuses to human-friendly labels and styling tokens
export function getStatusChipConfig(status: PostStatus): StatusChipConfig {
  switch (status) {
    case "draft":
      return {
        label: "Draft",
        className: "bg-status-draft-bg text-status-draft-fg border-transparent",
      };
    case "awaiting_approval":
      return {
        label: "Waiting for approval",
        className: "bg-status-draft-bg text-status-draft-fg border-transparent",
      };
    case "approved":
      return {
        label: "Approved",
        className: "bg-signal-soft text-primary border-signal-line",
      };
    case "published":
      return {
        label: "Published",
        className: "bg-card text-foreground border-border",
        hasCheckIcon: true,
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "bg-status-danger-bg text-status-danger-fg border-transparent",
      };
    case "failed":
      return {
        label: "Failed",
        className: "bg-status-danger-bg text-status-danger-fg border-transparent",
      };
    case "publishing":
      return {
        label: "Publishing",
        className: "bg-muted text-muted-foreground border-border",
      };
    case "expired":
      return {
        label: "Expired",
        className: "bg-muted text-muted-foreground border-border",
      };
    default:
      return {
        label: "Draft",
        className: "bg-status-draft-bg text-status-draft-fg border-transparent",
      };
  }
}

// Maps publication failure error codes to plain words and corresponding user actions
export function getPublicationErrorInfo(errorCode: string | null | undefined): PublicationErrorInfo {
  switch (errorCode) {
    case "token_invalid":
    case "connection_inactive":
      return {
        message: "Your LinkedIn connection needs to be renewed. Posting is paused until you reconnect.",
        action: "reconnect",
      };
    case "outcome_unknown":
      return {
        message: "We could not confirm whether this was posted. Check your LinkedIn profile before trying again.",
        action: "confirm_retry",
        isWarning: true,
      };
    case "window_missed":
      return {
        message: "The posting time passed before this could be published.",
        action: "none",
      };
    case "rejected_by_linkedin":
    case "permission_denied":
      return {
        message: "LinkedIn did not accept this post.",
        action: "retry",
      };
    case "rate_limited":
    case "step_failed":
      return {
        message: "We will try again shortly.",
        action: "auto_retry",
      };
    default:
      return {
        message: "Something went wrong while publishing.",
        action: "retry",
      };
  }
}

// Formats a YYYY-MM-DD or ISO date string into a user locale display string
export function formatRunDate(dateStr: string, locale: string = "en-US"): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    let dateObj: Date;
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      dateObj = new Date(year, month, day);
    } else {
      dateObj = new Date(dateStr);
    }
    if (isNaN(dateObj.getTime())) {
      return dateStr;
    }
    return dateObj.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Formats an ISO expiration date in the target timezone into plain words like 'Saturday at 4:05 PM'
export function formatDecisionDeadline(
  isoStr: string | null | undefined,
  timezone?: string | null
): string {
  if (!isoStr) return "";
  try {
    const dateObj = new Date(isoStr);
    if (isNaN(dateObj.getTime())) return "";

    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    if (timezone) {
      options.timeZone = timezone;
    }

    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(dateObj);

    let weekday = "";
    let hour = "";
    let minute = "";
    let dayPeriod = "";

    for (const part of parts) {
      if (part.type === "weekday") weekday = part.value;
      if (part.type === "hour") hour = part.value;
      if (part.type === "minute") minute = part.value;
      if (part.type === "dayPeriod") dayPeriod = part.value;
    }

    return `${weekday} at ${hour}:${minute} ${dayPeriod}`.trim();
  } catch {
    return "";
  }
}

// Formats the next scheduled draft time into plain words like 'Tue 28 Oct, 6:00 AM'
export function formatNextDraftTime(
  isoStr: string | null | undefined,
  timezone?: string | null
): string | null {
  if (!isoStr) return null;
  try {
    const dateObj = new Date(isoStr);
    if (isNaN(dateObj.getTime())) return null;

    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    if (timezone) {
      options.timeZone = timezone;
    }

    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(dateObj);

    let weekday = "";
    let day = "";
    let month = "";
    let hour = "";
    let minute = "";
    let dayPeriod = "";

    for (const part of parts) {
      if (part.type === "weekday") weekday = part.value;
      if (part.type === "day") day = part.value;
      if (part.type === "month") month = part.value;
      if (part.type === "hour") hour = part.value;
      if (part.type === "minute") minute = part.value;
      if (part.type === "dayPeriod") dayPeriod = part.value;
    }

    return `${weekday} ${day} ${month}, ${hour}:${minute} ${dayPeriod}`.trim();
  } catch {
    return null;
  }
}
