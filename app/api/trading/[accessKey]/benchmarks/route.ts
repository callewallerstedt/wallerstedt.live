import { NextResponse } from "next/server";

import { tradingAccessKeyMatches } from "@/lib/trading-access";
import { fetchTradingBenchmarks } from "@/lib/trading-quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accessKey: string }> },
) {
  const { accessKey } = await params;
  if (!tradingAccessKeyMatches(accessKey)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const series = await fetchTradingBenchmarks();
    return NextResponse.json(
      { series },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        },
      },
    );
  } catch {
    return NextResponse.json({ series: [] }, { status: 502 });
  }
}
