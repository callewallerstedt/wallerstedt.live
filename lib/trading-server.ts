import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getTradingBookUrl,
  parseTradingBook,
  type TradingBook,
  type TradingCandle,
  type TradingChartFile,
} from "@/lib/trading";

export async function getTradingBook(): Promise<TradingBook> {
  const remote = getTradingBookUrl();
  if (/^https?:\/\//i.test(remote)) {
    const response = await fetch(remote, { next: { revalidate: 60 } });
    if (!response.ok) {
      throw new Error(`Could not load trading book (${response.status})`);
    }
    return parseTradingBook(await response.json());
  }

  const file = await readFile(path.join(process.cwd(), "public", remote.replace(/^\//, "")), "utf8");
  return parseTradingBook(JSON.parse(file));
}

export async function getTradingChart(chartPath: string): Promise<TradingCandle[]> {
  if (/^https?:\/\//i.test(chartPath)) {
    const response = await fetch(chartPath, { next: { revalidate: 60 } });
    if (!response.ok) return [];
    const file = (await response.json()) as TradingChartFile;
    return file.candles ?? [];
  }

  try {
    const file = await readFile(path.join(process.cwd(), "public", chartPath.replace(/^\//, "")), "utf8");
    const parsed = JSON.parse(file) as TradingChartFile;
    return parsed.candles ?? [];
  } catch {
    return [];
  }
}

export async function getTradingCharts(book: TradingBook) {
  const entries = await Promise.all(
    book.positions.map(async (position) => [position.symbol, await getTradingChart(position.chart)] as const),
  );
  return Object.fromEntries(entries) as Record<string, TradingCandle[]>;
}
