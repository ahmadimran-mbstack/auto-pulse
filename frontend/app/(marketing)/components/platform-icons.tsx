import React from "react";
import { FaLinkedin, FaInstagram, FaFacebook, FaEnvelope } from "react-icons/fa6";
import { ColorfulSlackIcon } from "@/components/app/PlatformLabel";
import { cn } from "@/lib/utils";

/**
 * LinkedIn platform icon matching the dashboard's PlatformLabel artwork
 */
export function LinkedInIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <FaLinkedin
      aria-hidden="true"
      className={cn("text-[#0A66C2]", className)}
      {...props}
    />
  );
}

/**
 * 4-color Slack platform icon reused from the dashboard's ColorfulSlackIcon
 */
export function SlackIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return <ColorfulSlackIcon className={className} {...props} />;
}

/**
 * Email icon matching the dashboard's PlatformLabel artwork
 */
export function GmailIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <FaEnvelope
      aria-hidden="true"
      className={cn("text-[#EA4335]", className)}
      {...props}
    />
  );
}

/**
 * Email icon matching the dashboard's PlatformLabel artwork
 */
export function EmailIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <FaEnvelope
      aria-hidden="true"
      className={cn("text-[#EA4335]", className)}
      {...props}
    />
  );
}

/**
 * Instagram platform icon matching the dashboard's PlatformLabel artwork
 */
export function InstagramIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <FaInstagram
      aria-hidden="true"
      className={cn("text-[#E4405F]", className)}
      {...props}
    />
  );
}

/**
 * Facebook platform icon matching the dashboard's PlatformLabel artwork
 */
export function FacebookIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <FaFacebook
      aria-hidden="true"
      className={cn("text-[#0866FF]", className)}
      {...props}
    />
  );
}
