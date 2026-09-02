import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  alignedReturnPct,
  applyLiveQuotes,
  changePct,
  firstFillDate,
  getPositionMetrics,
  getPortfolioStats,
  getTradingDeskStats,
  parseTradingBook,
  rebaseToPercent,
  resolvePreviousClose,
  seriesTotalPct,
  sliceFrom,
  toPercentSeries,
  type TradingQuote,
} from "./trading";

function quote(partial: Partial<TradingQuote> & Pick<TradingQuote, "symbol" | "last">): TradingQuote {
  return {
    previousClose: null,
    dayPct: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    week52High: null,
    week52Low: null,
    time: null,
    prePrice: null,
    prePct: null,
    preTime: null,
    postPrice: null,
    postPct: null,
    ...partial,
  };
}

test("book seed parses and totals from live marks", () => {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8"));
  const book = parseTradingBook(raw);
  const stats = getTradingDeskStats(book);
  const portfolio = getPortfolioStats(book, book.portfolios[0]);

  assert.equal(book.portfolios[0]?.id, "rayner-live");
  assert.deepEqual(stats.namesHeld, ["GM", "KO", "MDT"]);
  assert.equal(stats.openPnlSek, portfolio.openPnlSek);
  assert.ok(Number.isFinite(stats.equitySek));
  assert.equal(Math.round(stats.equitySek), Math.round(book.experiment.capitalSek + stats.openPnlSek));
});

test("live quotes reprice positions and the equity total", () => {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8"));
  const book = parseTradingBook(raw);
  const liveBook = applyLiveQuotes(book, {
    fetchedAt: "2026-09-01T21:00:00+02:00",
    session: "open",
    stale: false,
    fxUsdSek: 10,
    quotes: {
      GM: quote({
        symbol: "GM",
        last: 90,
        previousClose: 86,
        dayPct: 4.65,
        dayHigh: 91,
        dayLow: 85,
        volume: 1,
        week52High: 100,
        week52Low: 50,
        time: "2026-09-01T21:00:00+02:00",
      }),
    },
  });

  const gm = liveBook.positions.find((position) => position.symbol === "GM");
  const stats = getTradingDeskStats(liveBook);
  assert.equal(gm?.last, 90);
  assert.equal(liveBook.fxUsdSek, 10);
  assert.ok(stats.openPnlSek !== book.stats.openPnlSek);
  assert.ok(stats.equitySek > 5000);
});

test("percent helpers rebase indexes from the first overlapping date", () => {
  const equity = [
    { time: "2026-01-10", value: 5000 },
    { time: "2026-02-10", value: 5500 },
  ];
  const index = [
    { time: "2026-01-09", value: 200 },
    { time: "2026-01-10", value: 200 },
    { time: "2026-02-10", value: 220 },
  ];

  assert.equal(changePct(5000, 5500), 10);
  assert.equal(seriesTotalPct(equity), 10);
  assert.deepEqual(
    toPercentSeries(equity).map((point) => point.value),
    [0, 10],
  );

  const rebased = rebaseToPercent(index, "2026-01-10");
  assert.equal(rebased[0]?.time, "2026-01-10");
  assert.equal(rebased[0]?.value, 0);
  assert.equal(rebased.at(-1)?.value, 10);

  const aligned = alignedReturnPct(equity, index);
  assert.equal(aligned.subjectPct, 10);
  assert.equal(aligned.benchmarkPct, 10);
  assert.equal(aligned.alpha, 0);

  const faster = [
    { time: "2026-01-09", value: 100 },
    { time: "2026-02-10", value: 130 },
  ];
  const vsFaster = alignedReturnPct(equity, faster);
  assert.equal(vsFaster.benchmarkPct, 30);
  assert.equal(vsFaster.alpha, -20);
});

test("compare window starts at first fill, not years of cash", () => {
  const equity = [
    { time: "2024-09-03", value: 5000 },
    { time: "2026-08-31", value: 5000 },
    { time: "2026-09-01", value: 5100 },
  ];
  const index = [
    { time: "2024-09-03", value: 100 },
    { time: "2026-08-31", value: 180 },
    { time: "2026-09-01", value: 181.8 },
  ];
  const book = parseTradingBook(
    JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8")),
  );
  assert.equal(firstFillDate(book), "2026-09-01");

  const windowed = sliceFrom(equity, "2026-09-01");
  assert.deepEqual(
    windowed.map((point) => point.time),
    ["2026-08-31", "2026-09-01"],
  );
  assert.equal(seriesTotalPct(windowed), 2);

  const aligned = alignedReturnPct(windowed, index);
  assert.equal(aligned.subjectPct, 2);
  assert.equal(aligned.benchmarkPct, 1);
  assert.equal(aligned.alpha, 1);
});

test("day P&L follows the printed day % instead of a 5-day chart close", () => {
  const implied = resolvePreviousClose(88, -0.756, 91.64);
  assert.ok(implied != null);
  assert.ok(Math.abs(implied - 88.67) < 0.02);

  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8"));
  const book = parseTradingBook(raw);
  const quotes = {
    KO: quote({ symbol: "KO", last: 88, previousClose: 91.64, dayPct: -0.756 }),
  };
  const liveBook = applyLiveQuotes(book, {
    fetchedAt: "2026-09-01T21:00:00+02:00",
    session: "closed",
    stale: false,
    fxUsdSek: 9.61,
    quotes,
  });
  const ko = liveBook.positions.find((position) => position.symbol === "KO");
  assert.ok(ko);
  const metrics = getPositionMetrics(ko, liveBook, quotes);
  assert.ok(Math.abs(metrics.daySek + 12.88) < 0.2);
  assert.ok(Math.abs(metrics.dayPct! + 0.756) < 0.001);
});
