// This component provides CSS perspective 3D tilt interaction with pointer sheen and layered translateZ depth.
"use client";

import React, { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2 } from "lucide-react";

interface HeroTiltCardProps {
  className?: string;
}

// HeroTiltCard implements pointer-driven 3D tilt with depth layers and soft sheen
export function HeroTiltCard({ className }: HeroTiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [sheen, setSheen] = useState<{ x: number; y: number; opacity: number }>({
    x: 50,
    y: 50,
    opacity: 0,
  });
  const [isTouch, setIsTouch] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Detect touch devices and reduced-motion preference
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

  // Update card tilt angles and sheen coordinates on pointer movement
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouch || reducedMotion || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Normalized coordinates from -0.5 to 0.5
    const normX = x / rect.width - 0.5;
    const normY = y / rect.height - 0.5;

    // Max 7 degrees tilt angle
    const maxTilt = 7;
    setRotateX(-normY * maxTilt);
    setRotateY(normX * maxTilt);

    // Sheen position percentages
    setSheen({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.14,
    });
  };

  // Reset tilt and fade sheen when pointer leaves the card area
  const handlePointerLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setSheen((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <div
      style={{ perspective: "1000px" }}
      className={`w-full max-w-2xl mx-auto ${className ?? ""}`}
    >
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="relative bg-white text-ink rounded-2xl border border-border-light p-6 sm:p-7 shadow-none select-none will-change-transform"
      >
        {/* Soft light sheen following the pointer */}
        {!isTouch && !reducedMotion && (
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
            style={{
              opacity: sheen.opacity,
              background: `radial-gradient(circle 320px at ${sheen.x}% ${sheen.y}%, rgba(255, 255, 255, 0.95), transparent 70%)`,
              mixBlendMode: "overlay",
              transform: "translateZ(26px)",
            }}
            aria-hidden="true"
          />
        )}

        {/* Card header layer sitting forward in 3D space */}
        <div
          style={{ transform: "translateZ(18px)" }}
          className="flex items-center justify-between pb-4 border-b border-border-light"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-xs text-neutral-700 font-normal">
              AR
            </div>
            <div>
              <div className="text-sm font-normal text-ink">Alex Rivera</div>
              <div className="text-xs text-text-muted-light">
                Founder and CEO at LaunchPath
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className="rounded-full text-xs font-normal border-border-light text-neutral-700 bg-neutral-50 flex items-center gap-1.5 px-2.5 py-0.5"
          >
            <Clock className="w-3 h-3 text-text-muted-light" />
            Awaiting approval
          </Badge>
        </div>

        {/* Draft body text layer sitting with intermediate 3D depth */}
        <div
          style={{ transform: "translateZ(12px)" }}
          className="py-4 text-sm text-neutral-800 leading-relaxed space-y-3 font-normal"
        >
          <p>
            Most founders wait until product launch day to talk about their work. By then, nobody is listening.
          </p>
          <p>
            Build your audience while building the product. Share the decisions, the small wins, and the reasoning behind each milestone.
          </p>
          <p>
            When launch day comes, you already have people who care about what you created.
          </p>
        </div>

        {/* Verification and action footer layer sitting prominent in 3D space */}
        <div
          style={{ transform: "translateZ(22px)" }}
          className="pt-3 pb-4 border-t border-border-light flex items-center justify-between text-xs text-text-muted-light"
        >
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-navy" />
            AI writing score: 11 / 100 (Passed check)
          </span>
          <span>Channel: Email link and Slack</span>
        </div>

        {/* Action buttons with raised depth */}
        <div
          style={{ transform: "translateZ(24px)" }}
          className="flex items-center justify-end gap-2.5 pt-1"
        >
          <Button
            variant="outline"
            className="rounded-full h-8 px-3.5 text-xs font-normal border-border-light text-neutral-700 hover:bg-neutral-100"
          >
            Request changes
          </Button>
          <Button className="rounded-full h-8 px-4 text-xs font-normal bg-ink text-white hover:bg-neutral-800">
            Approve and publish
          </Button>
        </div>
      </div>
    </div>
  );
}

