import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  typedRoutes: true,
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ];

    return [
      {
        source: "/vault/:path*",
        headers: privateHeaders,
      },
      {
        source: "/api/accounting/:path*",
        headers: privateHeaders,
      },
      {
        source: "/accounting-sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
