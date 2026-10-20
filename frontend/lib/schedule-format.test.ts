import { describe, it, expect } from "vitest";
import {
  formatTime12Hour,
  formatDaysOfWeek,
  formatSchedule,
} from "./schedule-format";

describe("time and schedule formatting", () => {
  it("formats 24-hour time into 12-hour AM/PM format", () => {
    expect(formatTime12Hour("09:00")).toBe("9:00 AM");
    expect(formatTime12Hour("00:15")).toBe("12:15 AM");
    expect(formatTime12Hour("12:00")).toBe("12:00 PM");
    expect(formatTime12Hour("14:30")).toBe("2:30 PM");
    expect(formatTime12Hour("23:59")).toBe("11:59 PM");
    expect(formatTime12Hour(null)).toBe("Time not set");
  });

  it("identifies weekdays", () => {
    // 0 is Monday, 4 is Friday
    expect(formatDaysOfWeek([0, 1, 2, 3, 4])).toBe("Weekdays");
  });

  it("identifies weekends", () => {
    // 5 is Saturday, 6 is Sunday
    expect(formatDaysOfWeek([5, 6])).toBe("Weekends");
  });

  it("identifies every day", () => {
    expect(formatDaysOfWeek([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });

  it("formats custom day selections", () => {
    expect(formatDaysOfWeek([0, 2, 4])).toBe("Mon, Wed, Fri");
    expect(formatDaysOfWeek([1])).toBe("Tue");
  });

  it("handles empty or invalid days", () => {
    expect(formatDaysOfWeek([])).toBe("No days scheduled");
  });

  it("combines days, time, and timezone into complete schedule phrase", () => {
    const result = formatSchedule("09:00", [0, 1, 2, 3, 4], "Asia/Karachi");
    expect(result).toBe("Weekdays at 9:00 AM, Asia/Karachi");

    const weekendResult = formatSchedule("14:30", [5, 6], "America/New_York");
    expect(weekendResult).toBe("Weekends at 2:30 PM, America/New_York");
  });
});
