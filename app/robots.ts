import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/learn",
          "/archive",
          "/tesla",
          "/tesla-trips",
          "/admin",
          "/vault",
          "/bolag",
          "/os",
          "/trading",
          "/api/tesla",
          "/api/accounting",
          "/api/trading",
        ],
      },
    ],
    sitemap: "https://wallerstedt.live/sitemap.xml",
  };
}
