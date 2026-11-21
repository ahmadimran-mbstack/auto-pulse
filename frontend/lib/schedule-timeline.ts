export const APPROVAL_LEAD_OPTIONS = [
  { minutes: 60, label: "1 hour before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 360, label: "6 hours before" },
  { minutes: 720, label: "12 hours before" },
] as const;

export const DRAFT_BUFFER_MINUTES = 10;

export function getTimezoneOffsetString(tz: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const val = parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC";
    return val.replace("GMT", "UTC");
  } catch {
    return "UTC";
  }
}

export function formatPlainScheduleTime(isoOrDate: string | Date | null | undefined, tz?: string | null): string {
  if (!isoOrDate) return "—";
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  const resolvedTz = tz || "UTC";
  try {
    const now = new Date();
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: resolvedTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dKey = dateFmt.format(d);
    const todayKey = dateFmt.format(now);
    const tomorrowKey = dateFmt.format(new Date(now.getTime() + 86_400_000));

    const timePart = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);

    if (dKey === todayKey) return `Today ${timePart}`;
    if (dKey === tomorrowKey) return `Tomorrow ${timePart}`;

    const dayPart = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTz,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(d);
    return `${dayPart}, ${timePart}`;
  } catch {
    return d.toLocaleString();
  }
}

export function computeNextPreviewTimeline(params: {
  timezone: string;
  postTime: string;
  postDays: number[];
  approvalLeadMinutes: number;
  now?: Date;
}): {
  draftAt: Date;
  approvalAt: Date;
  publishAt: Date;
  tooClose: boolean;
  minutesBeforePublish: number;
  tzOffset: string;
} | null {
  const { timezone, postTime, postDays, approvalLeadMinutes } = params;
  if (!timezone || !postTime || !postDays || postDays.length === 0) return null;
  const [hh, mm] = postTime.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  const now = params.now ?? new Date();
  const tz = timezone || "UTC";

  try {
    // Find next matching weekday in target timezone (Python weekday: Mon=0..Sun=6)
    const weekdayMap: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };

    for (let offsetDays = 0; offsetDays <= 8; offsetDays++) {
      const probe = new Date(now.getTime() + offsetDays * 86_400_000);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
      }).formatToParts(probe);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const pyWeekday = weekdayMap[get("weekday")];
      if (pyWeekday === undefined || !postDays.includes(pyWeekday)) continue;

      const y = Number(get("year"));
      const m = Number(get("month"));
      const d = Number(get("day"));
      const guessUtc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
      const tzParts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(guessUtc);
      const g = (t: string) => Number(tzParts.find((p) => p.type === t)?.value ?? 0);
      const h24 = g("hour") === 24 ? 0 : g("hour");
      const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), h24, g("minute"), g("second"));
      const publishAt = new Date(guessUtc.getTime() - (asUtc - guessUtc.getTime()));

      if (publishAt.getTime() > now.getTime() + 5 * 60_000) {
        const approvalAt = new Date(publishAt.getTime() - approvalLeadMinutes * 60_000);
        const draftAt = new Date(approvalAt.getTime() - DRAFT_BUFFER_MINUTES * 60_000);
        const tooClose = approvalAt.getTime() <= now.getTime();
        const minutesBeforePublish = Math.max(0, Math.floor((publishAt.getTime() - now.getTime()) / 60_000));
        return {
          draftAt: draftAt.getTime() < now.getTime() ? now : draftAt,
          approvalAt: tooClose ? now : approvalAt,
          publishAt,
          tooClose,
          minutesBeforePublish,
          tzOffset: getTimezoneOffsetString(tz, publishAt),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function formatCountdown(targetIso: string | null | undefined, nowMs: number): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMin = Math.floor((target - nowMs) / 60_000);
  if (diffMin <= 0) return "Due now";
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hrs > 0) return `Approve within ${hrs}h ${mins}m`;
  return `Approve within ${mins}m`;
}
