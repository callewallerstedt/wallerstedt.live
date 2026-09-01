import { readFile } from "node:fs/promises";
import path from "node:path";

import { getTradingBookUrl, parseTradingBook, type TradingBook } from "@/lib/trading";

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
