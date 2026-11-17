// Logo component for authentication pages
// Uses transparent PNG marks that automatically adapt to light and dark themes
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  href?: string;
  size?: number;
  className?: string;
}

export function Logo({ href = "/", size = 32, className }: LogoProps) {
  const content = (
    /* Always render the dark-theme logo mark on dark-only routes */
    <div
      className={cn("relative flex items-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo-mark-blue-bg.png"
        alt="AutoPulse logo"
        width={size}
        height={size}
        priority
        className="w-full h-full object-contain rounded-full"
      />
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-block transition-opacity hover:opacity-90"
        aria-label="AutoPulse home"
      >
        {content}
      </Link>
    );
  }

  return content;
}

