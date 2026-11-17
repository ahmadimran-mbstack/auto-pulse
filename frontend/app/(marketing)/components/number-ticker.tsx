// Animates a number from zero to its target value once without looping.
"use client";

import React, { useEffect, useRef, useState } from "react";

interface NumberTickerProps {
  value: number;
  active?: boolean;
  durationMs?: number;
  className?: string;
}

// Counts up smoothly using the shared expo-out curve and skips motion if reduced motion is on.
export function NumberTicker({
  value,
  active = true,
  durationMs = 650,
  className = "",
}: NumberTickerProps) {
  const [display, setDisplay] = useState(0);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (!active || hasPlayedRef.current) return;

    // Jump straight to the final number when reduced motion is enabled.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      hasPlayedRef.current = true;
      setDisplay(value);
      return;
    }

    hasPlayedRef.current = true;
    const startTime = performance.now();
    let frameId = 0;

    // Ease-out quint approximation of cubic-bezier(0.22, 1, 0.36, 1).
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.5);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const next = Math.round(easeOut(progress) * value);
      setDisplay(next);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, durationMs, value]);

  return <span className={className}>{display}</span>;
}

