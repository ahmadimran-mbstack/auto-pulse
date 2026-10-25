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

  return (
    <div className="space-y-1.5 text-left">
      <Label htmlFor={id}>
        Timezone <span className="text-primary">*</span>
      </Label>

      <p id={`${id}-hint`} className="text-caption text-muted-foreground">
        Select your local timezone so we schedule drafts at the right time.
      </p>

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
