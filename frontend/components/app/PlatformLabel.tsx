import * as React from "react";
import { FaLinkedin, FaInstagram, FaFacebook, FaWhatsapp, FaEnvelope } from "react-icons/fa6";
import { cn } from "@/lib/utils";

export type PlatformType =
  | "slack"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "email"
  | "whatsapp";

export interface PlatformLabelProps {
  platform: PlatformType;
  size?: "xs" | "sm" | "md" | "lg" | number;
  showName?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

/**
 * Authentic 4-color Slack icon (Red #E01E5A, Cyan #36C5F0, Green #2EB67D, Yellow #ECB22E)
 */
export function ColorfulSlackIcon({
  className,
  style,
  "aria-hidden": ariaHidden = true,
}: {
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}) {
  return (
    <svg
      viewBox="0 0 122.8 122.8"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
        fill="#E01E5A"
      />
      <path
        d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
        fill="#36C5F0"
      />
      <path
        d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
        fill="#2EB67D"
      />
      <path
        d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
        fill="#ECB22E"
      />
    </svg>
  );
}

const PLATFORM_CONFIG: Record<
  PlatformType,
  {
    name: string;
    icon: React.ComponentType<{
      className?: string;
      "aria-hidden"?: boolean | "true" | "false";
      style?: React.CSSProperties;
    }>;
    iconColorClass: string;
  }
> = {
  slack: {
    name: "Slack",
    icon: ColorfulSlackIcon,
    iconColorClass: "", // Colors are baked into the authentic 4-color SVG paths
  },
  linkedin: {
    name: "LinkedIn",
    icon: FaLinkedin,
    iconColorClass: "text-[#0A66C2]",
  },
  instagram: {
    name: "Instagram",
    icon: FaInstagram,
    iconColorClass: "text-[#E4405F]",
  },
  facebook: {
    name: "Facebook",
    icon: FaFacebook,
    iconColorClass: "text-[#0866FF]",
  },
  email: {
    name: "Email",
    icon: FaEnvelope,
    iconColorClass: "text-[#EA4335]",
  },
  whatsapp: {
    name: "WhatsApp",
    icon: FaWhatsapp,
    iconColorClass: "text-[#25D366]",
  },
};

const SIZE_MAP: Record<"xs" | "sm" | "md" | "lg", { icon: string; text: string }> = {
  xs: { icon: "size-3", text: "text-xs" },
  sm: { icon: "size-3.5", text: "text-xs" },
  md: { icon: "size-4", text: "text-sm" },
  lg: { icon: "size-5", text: "text-base" },
};

/**
 * PlatformLabel renders a platform brand icon followed by its formatted display name.
 * All brand icons, colors, and accessibility labels are encapsulated in this single component.
 */
export function PlatformLabel({
  platform,
  size = "md",
  showName = true,
  className,
  iconClassName,
  textClassName,
}: PlatformLabelProps) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return null;

  const Icon = config.icon;
  const isNamedSize = typeof size === "string" && size in SIZE_MAP;
  const sizeStyles = isNamedSize ? SIZE_MAP[size as "xs" | "sm" | "md" | "lg"] : null;
  const numericSize = typeof size === "number" ? size : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 align-middle font-medium",
        sizeStyles?.text,
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("shrink-0", config.iconColorClass, sizeStyles?.icon, iconClassName)}
        style={numericSize ? { width: numericSize, height: numericSize } : undefined}
      />
      {showName ? (
        <span className={cn("truncate", textClassName)}>{config.name}</span>
      ) : (
        <span className="sr-only">{config.name}</span>
      )}
    </span>
  );
}
