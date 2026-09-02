import { notFound } from "next/navigation";

import { tradingAccessKeyMatches } from "@/lib/trading-access";
import { fetchTradingLive } from "@/lib/trading-quotes";
import { getTradingBook, getTradingCharts } from "@/lib/trading-server";

import { TradingApp } from "../TradingApp";

export const dynamic = "force-dynamic";

export default async function PrivateTradingPage({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}) {
  const { accessKey } = await params;
  if (!tradingAccessKeyMatches(accessKey)) {
    notFound();
  }

  const book = await getTradingBook();
  const [charts, live] = await Promise.all([
    getTradingCharts(book),
    fetchTradingLive(book.positions.map((position) => position.symbol)).catch(() => null),
  ]);

  return <TradingApp accessKey={accessKey} book={book} charts={charts} initialLive={live} />;
}
