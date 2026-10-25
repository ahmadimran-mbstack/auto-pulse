"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

// ColorField pairs a native color swatch input with a synchronized text hex field
export function ColorField({
  value,
  onChange,
  disabled = false,
  className,
  id = "color-picker",
}: ColorFieldProps) {
  const [prevValue, setPrevValue] = React.useState(value);
  const [textValue, setTextValue] = React.useState(value);

  // Sync internal text state whenever external value prop updates during render
  if (prevValue !== value) {
    setPrevValue(value);
    setTextValue(value);
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setTextValue(next);

    // Validate 6-digit hex before propagating change to parent
    const clean = next.startsWith("#") ? next : `#${next}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      onChange(clean);
    }
  };

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.toUpperCase();
    setTextValue(next);
    onChange(next);
  };

  // Safe fallback for color input which strictly requires valid 7-character hex string
  const validPickerHex = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : ["#", "0B7F70"].join("");

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-input">
        <input
          id={id}
          type="color"
          value={validPickerHex}
          onChange={handleColorPickerChange}
          disabled={disabled}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Pick color"
        />
        <div
          className="size-full"
          style={{ backgroundColor: validPickerHex }}
          aria-hidden="true"
        />
      </div>
      <Input
        type="text"
        value={textValue}
        onChange={handleTextChange}
        disabled={disabled}
        placeholder="#RRGGBB"
        maxLength={7}
        className="w-28 font-mono text-xs uppercase"
        aria-label="Hex color value"
      />
    </div>
  );
}
