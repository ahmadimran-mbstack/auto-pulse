import type { PostStatus } from "@/types/posts";

// UI configuration for a status chip
export interface StatusChipConfig {
  label: string;
  className: string;
  hasCheckIcon?: boolean;
}

// Maps post statuses to human-friendly labels and styling tokens
export function getStatusChipConfig(status: PostStatus): StatusChipConfig {
  switch (status) {
    case "draft":
      return {
        label: "Draft",
        className: "bg-draft-bg text-draft-text border-[#F5E5BA]",
      };
    case "awaiting_approval":
      return {
        label: "Waiting for approval",
        className: "bg-draft-bg text-draft-text border-[#F5E5BA]",
      };
    case "approved":
      return {
        label: "Approved",
        className: "bg-signal-soft text-signal border-signal-border",
      };
    case "published":
      return {
        label: "Published",
        className: "bg-paper text-ink border-line",
        hasCheckIcon: true,
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "bg-rejected-bg text-rejected-text border-[#F5C2B9]",
      };
    case "failed":
      return {
        label: "Failed",
        className: "bg-rejected-bg text-rejected-text border-[#F5C2B9]",
      };
    case "publishing":
      return {
        label: "Publishing",
        className: "bg-paper text-muted border-line",
      };
    default:
      return {
        label: "Draft",
        className: "bg-draft-bg text-draft-text border-[#F5E5BA]",
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
