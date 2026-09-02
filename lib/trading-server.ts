import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseTradingBook, type TradingBook, type TradingCandle, type TradingChartFile } from "@/lib/trading";
import { fetchTradingDailyCandles } from "@/lib/trading-quotes";

const DATA_DIR = path.join(process.cwd(), "data", "trading");
const BOOK_FILE = path.join(DATA_DIR, "book.json");
const BOOK_BLOB = "trading/book.json";

async function readSeedBook(): Promise<TradingBook> {
  const file = await readFile(BOOK_FILE, "utf8");
  return parseTradingBook(JSON.parse(file));
}

async function readBlobBook(): Promise<TradingBook | null> {
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(BOOK_BLOB, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return parseTradingBook(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function getTradingBook(): Promise<TradingBook> {
  return (await readBlobBook()) ?? (await readSeedBook());
}

export async function saveTradingBook(book: TradingBook): Promise<TradingBook> {
  const parsed = parseTradingBook(book);
  const payload = `${JSON.stringify(parsed, null, 2)}\n`;
  const writes: Array<Promise<unknown>> = [
    writeFile(BOOK_FILE, payload, "utf8").catch(() => null),
  ];
  try {
    const { put } = await import("@vercel/blob");
    writes.push(
      put(BOOK_BLOB, payload, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      }),
    );
  } catch {
    /* local seed file is enough in dev */
  }
  await Promise.all(writes);
  return parsed;
}

export async function getTradingChart(symbol: string): Promise<TradingCandle[]> {
  try {
    const file = await readFile(path.join(DATA_DIR, "charts", `${symbol.toUpperCase()}.json`), "utf8");
    const parsed = JSON.parse(file) as TradingChartFile;
    if (parsed.candles?.length) return parsed.candles;
  } catch {
    /* fetch live history for names that are not in the seed */
  }
  try {
    return await fetchTradingDailyCandles(symbol);
  } catch {
    return [];
  }
}

export async function getTradingCharts(book: TradingBook) {
  const symbols = [...new Set(book.positions.map((position) => position.symbol))];
  const entries = await Promise.all(symbols.map(async (symbol) => [symbol, await getTradingChart(symbol)] as const));
  return Object.fromEntries(entries) as Record<string, TradingCandle[]>;
}
