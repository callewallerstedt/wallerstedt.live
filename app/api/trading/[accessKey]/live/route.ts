import { NextResponse } from "next/server";

import { tradingAccessKeyMatches } from "@/lib/trading-access";
import { fetchTradingLive } from "@/lib/trading-quotes";
import { getTradingBook } from "@/lib/trading-server";

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
    const book = await getTradingBook();
    const live = await fetchTradingLive(book.positions.map((position) => position.symbol));
    return NextResponse.json(live, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
