"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

// Standard external store subscription to check client mount without triggering effect cascading renders
const emptySubscribe = () => () => {};

function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

// Segmented control for switching between system, light, and dark themes
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const currentTheme = mounted ? theme : "system";

  return (
    <div
      role="radiogroup"
      aria-label="Color theme selection"
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-secondary p-0.5 gap-0.5",
        className
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === "system"}
        aria-label="System theme"
        onClick={() => setTheme("system")}
        className={cn(
          "flex size-7 items-center justify-center rounded-sm transition-colors",
          currentTheme === "system"
            ? "bg-card text-foreground border border-border"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Monitor className="size-4" />
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === "light"}
        aria-label="Light theme"
        onClick={() => setTheme("light")}
        className={cn(
          "flex size-7 items-center justify-center rounded-sm transition-colors",
          currentTheme === "light"
            ? "bg-card text-foreground border border-border"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sun className="size-4" />
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === "dark"}
        aria-label="Dark theme"
        onClick={() => setTheme("dark")}
        className={cn(
          "flex size-7 items-center justify-center rounded-sm transition-colors",
          currentTheme === "dark"
            ? "bg-card text-foreground border border-border"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Moon className="size-4" />
      </button>
    </div>
  );
}
