// Pure functions for formatting posting schedules into human-friendly phrases

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Formats 24-hour "HH:MM" string into 12-hour "H:MM AM/PM"
export function formatTime12Hour(time24: string | null): string {
  if (!time24 || !time24.includes(":")) {
    return "Time not set";
  }

  const [hourStr, minuteStr] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) {
    return time24;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const formattedMinute = minute.toString().padStart(2, "0");

  return `${hour12}:${formattedMinute} ${period}`;
}

// Formats a list of day numbers (0 to 6, where Monday is 0) into plain English
export function formatDaysOfWeek(days: number[]): string {
  if (!days || days.length === 0) {
    return "No days scheduled";
  }

  const uniqueSorted = Array.from(new Set(days))
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b);

  if (uniqueSorted.length === 0) {
    return "No days scheduled";
  }

  if (uniqueSorted.length === 7) {
    return "Every day";
  }

  const isWeekdays =
    uniqueSorted.length === 5 &&
    uniqueSorted.every((d, i) => d === i); // 0, 1, 2, 3, 4

  if (isWeekdays) {
    return "Weekdays";
  }

  const isWeekends =
    uniqueSorted.length === 2 &&
    uniqueSorted[0] === 5 &&
    uniqueSorted[1] === 6;

  if (isWeekends) {
    return "Weekends";
  }

  return uniqueSorted.map((d) => DAY_NAMES[d]).join(", ");
}

// Combines days, post time, and timezone into a clear summary phrase
// Example: "Weekdays at 9:00 AM, Asia/Karachi"
export function formatSchedule(
  postTime: string | null,
  postDays: number[],
  timezone: string | null
): string {
  const daysText = formatDaysOfWeek(postDays);
  const timeText = formatTime12Hour(postTime);
  const tzText = timezone || "UTC";

  if (daysText === "No days scheduled" && timeText === "Time not set") {
    return "Schedule not configured";
  }

  if (timeText === "Time not set") {
    return `${daysText}, ${tzText}`;
  }

  return `${daysText} at ${timeText}, ${tzText}`;
}
