import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getPortfolioStats, getTradingDeskStats, parseTradingBook } from "./trading";

test("book seed parses and totals the live book", () => {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8"));
  const book = parseTradingBook(raw);
  const stats = getTradingDeskStats(book);
  const portfolio = getPortfolioStats(book, book.portfolios[0]);

  assert.equal(book.portfolios[0]?.id, "rayner-live");
  assert.deepEqual(stats.namesHeld, ["GM", "KO", "MDT"]);
  assert.equal(stats.openPnlSek, -23);
  assert.equal(stats.equitySek, 4977);
  assert.equal(portfolio.openPnlSek, -23);
});
