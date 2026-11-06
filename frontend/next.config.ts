import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      {
        source: "/app/onboarding",
        destination: "/onboarding",
        permanent: false,
      },
      {
        source: "/app/onboarding/:path*",
        destination: "/onboarding",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/app/connections",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/app/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
