// This component provides a 4-degree perspective tilt card with optional Magic Card pointer border glow.
"use client";

import React, { useRef, useState, useEffect } from "react";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  enableMagicBorder?: boolean;
}

// TiltCard applies subtle pointer tracking tilt and cursor-following border highlights
export function TiltCard({
  children,
  className = "",
  maxTilt = 4,
  enableMagicBorder = false,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0, active: false });
  const [isTouch, setIsTouch] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const touchQuery = window.matchMedia("(pointer: coarse)");
    setIsTouch(touchQuery.matches || "ontouchstart" in window);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motionQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    motionQuery.addEventListener("change", handleMotionChange);

    return () => motionQuery.removeEventListener("change", handleMotionChange);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouch || reducedMotion || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const normX = x / rect.width - 0.5;
    const normY = y / rect.height - 0.5;

    setRotateX(-normY * maxTilt);
    setRotateY(normX * maxTilt);
    setPointerPos({ x, y, active: true });
  };

  const handlePointerLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setPointerPos((prev) => ({ ...prev, active: false }));
  };

  return (
    <div
      style={{ perspective: "1000px" }}
      className={`relative w-full ${className}`}
    >
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="relative rounded-2xl will-change-transform"
      >
        {/* Magic Card border highlight that follows pointer on bento cards only */}
        {enableMagicBorder && !isTouch && !reducedMotion && pointerPos.active && (
          <div
            className="pointer-events-none absolute -inset-[1px] rounded-2xl transition-opacity duration-300 z-0"
            style={{
              background: `radial-gradient(280px circle at ${pointerPos.x}px ${pointerPos.y}px, rgba(26, 86, 184, 0.35), transparent 70%)`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Card content container with white surface */}
        <div className="relative z-10 w-full h-full bg-white rounded-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}

