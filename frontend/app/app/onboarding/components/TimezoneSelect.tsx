"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface TimezoneSelectProps {
  id: string;
  value: string;
  onChange: (tz: string) => void;
  error?: string;
}

// Fallback timezone list in case Intl.supportedValuesOf is unavailable
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

// Timezone selector built using shadcn Select
export function TimezoneSelect({
  id,
  value,
  onChange,
  error,
}: TimezoneSelectProps) {
  const timezones = (() => {
    try {
      if (
        typeof Intl !== "undefined" &&
        typeof Intl.supportedValuesOf === "function"
      ) {
        return Intl.supportedValuesOf("timeZone");
      }
    } catch {
      // Ignore error and fall back
    }
    return FALLBACK_TIMEZONES;
  })();

  const detectedTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  })();

  const currentTimeInTz = (() => {
    try {
      return new Date().toLocaleTimeString("en-US", {
        timeZone: value || "UTC",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-2 text-left">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label htmlFor={id}>
          Timezone <span className="text-primary">*</span>
        </Label>
        {currentTimeInTz && (
          <span className="text-[11px] text-muted-foreground font-mono">
            Current time: <span className="font-semibold text-foreground">{currentTimeInTz}</span>
          </span>
        )}
      </div>

      <p id={`${id}-hint`} className="text-caption text-muted-foreground">
        Select your local timezone so AutoPulse creates and publishes your posts at your desired local hours.
      </p>

      {detectedTz && detectedTz !== value && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/60 border border-border text-xs">
          <span className="text-muted-foreground">Detected device timezone:</span>
          <button
            type="button"
            onClick={() => onChange(detectedTz)}
            className="font-medium text-primary hover:underline cursor-pointer"
          >
            Switch to {detectedTz}
          </button>
        </div>
      )}

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-describedby={`${id}-hint ${error ? `${id}-error` : ""}`.trim()}
          className="w-full"
        >
          <SelectValue placeholder="Select timezone" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {timezones.map((tz) => (
            <SelectItem key={tz} value={tz}>
              {tz}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-caption text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
