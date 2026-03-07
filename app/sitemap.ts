import type { MetadataRoute } from "next";

import { catalogSongs } from "@/lib/site-data";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://wallerstedt.live",
      changeFrequency: "weekly",
      priority: 1,
    },
    ...catalogSongs.map((song) => ({
      url: `https://wallerstedt.live/${song.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
