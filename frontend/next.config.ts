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
        source: "/onboarding",
        destination: "/app/onboarding",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/app/connections",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
