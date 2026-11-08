import React from "react";

/**
 * Official LinkedIn platform icon (authentic #0A66C2 blue tile with white 'in')
 */
export function LinkedInIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path
        d="M7.1 6.8a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0zm-.3 3.6H4.2v9.8h2.6v-9.8zm4.1 0H8.4v9.8h2.5v-5.2c0-1.4.3-2.7 2-2.7 1.7 0 1.7 1.6 1.7 2.8v5.1h2.6v-5.7c0-2.8-.6-5-3.8-5-1.5 0-2.5.8-2.9 1.6h-.1v-1.4z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Authentic 4-color Slack platform icon (#E01E5A, #36C5F0, #2EB67D, #ECB22E)
 */
export function SlackIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 122.8 122.8"
      className={className}
      aria-hidden="true"
      fill="none"
      {...props}
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

/**
 * Official Google Gmail 4-color platform icon
 */
export function GmailIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path fill="#4caf50" d="M45,16.2l-5,2.75l-0.5,4.75L45,40V16.2z" />
      <path fill="#1e88e5" d="M3,16.2l5,2.75l0.5,4.75L3,40V16.2z" />
      <path
        fill="#e53935"
        d="M45,16.2v-3.7c0-1.8-1.5-3.3-3.3-3.3c-0.8,0-1.6,0.3-2.2,0.8L24,21.8L8.5,10c-0.6-0.5-1.4-0.8-2.2-0.8C4.5,9.2,3,10.7,3,12.5v3.7L24,31.7L45,16.2z"
      />
      <polygon fill="#c62828" points="24,31.7 8.5,20.2 3,24.2 3,40 8,40 8,24.5" />
      <polygon fill="#fbc02d" points="45,40 45,24.2 39.5,20.2 24,31.7 40,24.5 40,40" />
    </svg>
  );
}

/**
 * Clean red brand Email envelope icon
 */
export function EmailIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="4" width="20" height="16" rx="3" fill="#EA4335" />
      <path
        d="M3 6.5L12 13L21 6.5"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Official Instagram platform icon (authentic radial gradient with white glyph)
 */
export function InstagramIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <radialGradient id="ap-ig-grad" cx="20%" cy="105%" r="130%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ap-ig-grad)" />
      <path
        d="M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 7.4a2.9 2.9 0 1 1 0-5.8 2.9 2.9 0 0 1 0 5.8zm5.7-7.7a1.05 1.05 0 1 1-2.1 0 1.05 1.05 0 0 1 2.1 0zM12 4.6c2.4 0 2.7 0 3.6.05.9.04 1.4.2 1.7.32.4.16.7.36 1 .66.3.3.5.6.66 1 .12.3.28.8.32 1.7.05.9.05 1.2.05 3.6s0 2.7-.05 3.6c-.04.9-.2 1.4-.32 1.7-.16.4-.36.7-.66 1-.3.3-.6.5-1 .66-.3.12-.8.28-1.7.32-.9.05-1.2.05-3.6.05s-2.7 0-3.6-.05c-.9-.04-1.4-.2-1.7-.32-.4-.16-.7-.36-1-.66-.3-.3-.5-.6-.66-1-.12-.3-.28-.8-.32-1.7-.05-.9-.05-1.2-.05-3.6s0-2.7.05-3.6c.04-.9.2-1.4.32-1.7.16-.4.36-.7.66-1 .3-.3.6-.5 1-.66.3-.12.8-.28 1.7-.32.9-.05 1.2-.05 3.6-.05z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Official Facebook platform icon (#0866FF circle with white 'f')
 */
export function FacebookIcon({
  className = "w-4 h-4",
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="12" fill="#0866FF" />
      <path
        d="M13.5 22.8v-8.4h2.8l.4-3.3h-3.2V9.1c0-1 .3-1.6 1.7-1.6h1.8V4.6c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.1H7.2v3.3H10v8.4c.7.1 1.4.2 2.2.2.7 0 1.4-.1 2.2-.2z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

