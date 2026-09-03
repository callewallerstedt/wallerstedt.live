import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accessKey: string }> },
) {
  const { accessKey } = await params;
  const encodedKey = encodeURIComponent(accessKey);
  const startUrl = `/bolag/${encodedKey}`;
  return NextResponse.json(
    {
      id: startUrl,
      name: "Wallerstedt Bolag",
      short_name: "Bolag",
      description: "Owner dashboard for Wallerstedt Productions AB.",
      start_url: startUrl,
      scope: "/bolag/",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#161616",
      theme_color: "#161616",
      categories: ["business", "finance", "productivity"],
      lang: "en",
      icons: [
        {
          src: "/accounting-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/accounting-icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
    {
      headers: {
        // The manifest carries the secret start URL, so it must never be cached
        // by a shared proxy or indexed.
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
