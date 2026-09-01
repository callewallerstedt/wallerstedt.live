import { notFound } from "next/navigation";

import { tradingAccessKeyMatches } from "@/lib/trading-access";
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
  const charts = await getTradingCharts(book);

  return <TradingApp book={book} charts={charts} />;
}
