import { NextResponse } from "next/server";

import { tradingAccessKeyMatches } from "@/lib/trading-access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accessKey: string }>; },
) {
  const { accessKey } = await params;
  if (!tradingAccessKeyMatches(accessKey)) {
    return new NextResponse(null, { status: 404 });
  }

  const encodedKey = encodeURIComponent(accessKey);
  const startUrl = `/trading/${encodedKey}`;
  return NextResponse.json(
    {
      id: startUrl,
      name: "Wallerstedt Trading",
      short_name: "Trading",
      start_url: startUrl,
      scope: "/trading/",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#161616",
      theme_color: "#161616",
      lang: "sv-SE",
      icons: [
        { src: "/trading-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/trading-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
