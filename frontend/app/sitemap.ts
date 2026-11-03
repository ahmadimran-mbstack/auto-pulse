// Dynamic sitemap for AutoPulse marketing and public legal pages
// Informs search engine crawlers about indexable routes
import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://autopulse.app";
  const lastUpdated = new Date("2026-11-03");

  return [
    {
      url: `${baseUrl}`,
      lastModified: lastUpdated,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: lastUpdated,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: lastUpdated,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}

