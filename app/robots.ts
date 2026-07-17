import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/learn",
          "/tesla",
          "/tesla-trips",
          "/admin",
          "/vault",
          "/api/tesla",
          "/api/accounting",
        ],
      },
    ],
    sitemap: "https://wallerstedt.live/sitemap.xml",
  };
}
