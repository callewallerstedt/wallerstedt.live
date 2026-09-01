import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseTradingBook, type TradingBook, type TradingCandle, type TradingChartFile } from "@/lib/trading";

const DATA_DIR = path.join(process.cwd(), "data", "trading");

export async function getTradingBook(): Promise<TradingBook> {
  const file = await readFile(path.join(DATA_DIR, "book.json"), "utf8");
  return parseTradingBook(JSON.parse(file));
}

export async function getTradingChart(symbol: string): Promise<TradingCandle[]> {
  try {
    const file = await readFile(path.join(DATA_DIR, "charts", `${symbol.toUpperCase()}.json`), "utf8");
    const parsed = JSON.parse(file) as TradingChartFile;
    return parsed.candles ?? [];
  } catch {
    return [];
  }
}

export async function getTradingCharts(book: TradingBook) {
  const symbols = [...new Set(book.positions.map((position) => position.symbol))];
  const entries = await Promise.all(symbols.map(async (symbol) => [symbol, await getTradingChart(symbol)] as const));
  return Object.fromEntries(entries) as Record<string, TradingCandle[]>;
}
