import { NextResponse } from "next/server";

import { tradingAccessKeyMatches } from "@/lib/trading-access";
import { getTradingBook, getTradingCharts } from "@/lib/trading-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  const { accessKey } = await params;
  if (!tradingAccessKeyMatches(accessKey)) {
    return new NextResponse(null, { status: 404 });
  }

  const book = await getTradingBook();
  const charts = await getTradingCharts(book);
  return NextResponse.json(
    { book, charts },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      },
    },
  );
}
