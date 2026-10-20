"use client";

import { useEffect, useRef, useState } from "react";

interface TimezoneSelectProps {
  id: string;
  value: string;
  onChange: (tz: string) => void;
  error?: string;
}

// Fallback timezone list in case Intl.supportedValuesOf is not supported in the runtime
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

export function TimezoneSelect({ id, value, onChange, error }: TimezoneSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Safely retrieve supported timezones from the browser environment
  const timezones = (() => {
    try {
      if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
        return Intl.supportedValuesOf("timeZone");
      }
    } catch {
      // Fallback
    }
    return FALLBACK_TIMEZONES;
  })();

  // Filter timezones based on current search term
  const filteredTimezones = searchQuery.trim()
    ? timezones.filter((tz) =>
        tz.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : timezones;

  // Close dropdown on clicks outside the component
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (tz: string) => {
    onChange(tz);
    setSearchQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative space-y-1.5 text-left">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          Timezone <span className="text-signal">*</span>
        </label>
      </div>

      <p id={`${id}-hint`} className="text-xs text-muted">
        Select your local timezone so we schedule drafts at the right time.
      </p>

      {/* Combobox trigger input */}
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-describedby={`${id}-hint ${error ? `${id}-error` : ""}`.trim()}
          value={isOpen ? searchQuery : value}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setSearchQuery("");
            setIsOpen(true);
          }}
          placeholder="Type to search timezone..."
          className={`w-full h-10 px-3 pr-10 rounded-[8px] border bg-surface text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-2 focus:outline-signal focus:outline-offset-2 ${
            error ? "border-rejected-text" : "border-line"
          }`}
        />

        {/* Toggle chevron icon */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              setSearchQuery("");
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
          aria-label="Toggle timezone dropdown"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer p-1"
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown listbox */}
      {isOpen && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-[8px] border border-line bg-surface py-1 shadow-lg text-sm text-ink focus:outline-none"
        >
          {filteredTimezones.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No matching timezone found</li>
          ) : (
            filteredTimezones.map((tz) => {
              const isSelected = tz === value;
              return (
                <li
                  key={tz}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(tz)}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected
                      ? "bg-signal-soft/40 text-signal font-medium"
                      : "hover:bg-paper text-ink"
                  }`}
                >
                  <span>{tz}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-signal" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-rejected-text">
          {error}
        </p>
      )}
    </div>
  );
}
