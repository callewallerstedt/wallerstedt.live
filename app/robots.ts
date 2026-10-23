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
          "/agent",
          "/accounting",
          "/finance",
          "/dev",
          "/api/",
        ],
      },
    ],
    sitemap: "https://wallerstedt.live/sitemap.xml",
  };
}
