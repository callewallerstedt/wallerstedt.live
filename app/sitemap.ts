import type { MetadataRoute } from "next";

import { catalogReleases, catalogSongs } from "@/lib/site-data";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://wallerstedt.live",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://wallerstedt.live/music",
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://wallerstedt.live/playlists",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://wallerstedt.live/updates",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...catalogReleases.map((release) => ({
      url: `https://wallerstedt.live/music/${release.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...catalogSongs.map((song) => ({
      url: `https://wallerstedt.live/${song.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
