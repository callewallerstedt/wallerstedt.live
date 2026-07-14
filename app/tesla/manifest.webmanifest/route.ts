import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    id: "/tesla",
    name: "Wallerstedt Drive",
    short_name: "Drive",
    description: "Live Tesla dashboard, trips, GPS and hands-free voice.",
    start_url: "/tesla",
    scope: "/tesla",
    display: "standalone",
    orientation: "any",
    background_color: "#050607",
    theme_color: "#050607",
    categories: ["navigation", "utilities"],
    icons: [
      { src: "/tesla-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/tesla-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
