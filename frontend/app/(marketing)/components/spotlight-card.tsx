// Renders a dark card with a cursor-following border spotlight and subtle hover lift.
"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
}

// Tracks pointer position on desktop to illuminate the card border without using Three.js.
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, active: false });
  const [disabled, setDisabled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch =
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window;
    const isReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    setDisabled(isTouch || isReduced);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      active: true,
    });
  };

  const handlePointerLeave = () => {
    setPos((prev) => ({ ...prev, active: false }));
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(
        "touch-disable-hover relative rounded-2xl p-px transition-transform duration-300 lg:hover:-translate-y-0.5",
        className
      )}
      style={{
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        backgroundColor: "var(--lp-border)",
      }}
    >
      {/* Border spotlight layer that follows the pointer on desktop */}
      {!disabled && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
          style={{
            opacity: pos.active ? 1 : 0,
            background: `radial-gradient(260px circle at ${pos.x}px ${pos.y}px, var(--lp-ice), var(--lp-blue) 45%, transparent 75%)`,
          }}
        />
      )}

      {/* Inner card surface keeping the 1px top highlight and dark background */}
      <div
        className="relative z-10 h-full w-full rounded-2xl border border-transparent transition-colors duration-300"
        style={{
          backgroundColor: "var(--lp-surface)",
          boxShadow: "var(--lp-highlight-top)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

