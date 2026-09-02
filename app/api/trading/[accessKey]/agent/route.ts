import { NextResponse } from "next/server";

import { tradingAccessKeyMatches } from "@/lib/trading-access";
import { applyTradingAgentBody, publicTradingBook, type TradingAgentBody } from "@/lib/trading-agent";
import { getTradingBook, saveTradingBook } from "@/lib/trading-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
};

type Params = { params: Promise<{ accessKey: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function GET(_request: Request, { params }: Params) {
  const { accessKey } = await params;
  if (!tradingAccessKeyMatches(accessKey)) {
    return new NextResponse(null, { status: 404 });
  }

  const base = `/api/trading/${encodeURIComponent(accessKey)}/agent`;
  const book = await getTradingBook();
  return json({
    ok: true,
    name: "Wallerstedt trading desk agent",
    book: publicTradingBook(book),
    auth: "Same secret path as the desk. POST /api/trading/<key>/agent with JSON or plain text.",
    endpoints: {
      inspect: `GET ${base}`,
      apply: `POST ${base}`,
      book: `GET /api/trading/${encodeURIComponent(accessKey)}/book`,
    },
    examples: {
      commands: {
        commands: [
          "hold NVDA 1 @ 172.40 stop 166 target 185 name NVIDIA",
          "close KO @ 88.10",
          "capital 5000",
        ],
      },
      text: "hold NVDA 1 @ 172.40 stop 166 target 185 name NVIDIA\nclose KO @ 88.10",
      json: {
        hold: [{ symbol: "NVDA", shares: 1, fill: 172.4, stop: 166, target: 185, name: "NVIDIA" }],
        close: [{ symbol: "KO", exit: 88.1 }],
        capitalSek: 5000,
      },
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const { accessKey } = await params;
  if (!tradingAccessKeyMatches(accessKey)) {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let body: TradingAgentBody;
  try {
    if (contentType.includes("text/plain")) {
      body = { text: await request.text() };
    } else {
      body = (await request.json()) as TradingAgentBody;
    }
  } catch {
    return json({ ok: false, error: "JSON or plain-text body required" }, 400);
  }

  try {
    const current = await getTradingBook();
    const applied = applyTradingAgentBody(current, body ?? {});
    const saved = await saveTradingBook(applied.book);
    return json({ ok: true, notes: applied.notes, book: publicTradingBook(saved) });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Apply failed" }, 400);
  }
}
