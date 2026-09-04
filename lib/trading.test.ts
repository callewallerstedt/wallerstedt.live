import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  alignedReturnPct,
  applyLiveCandles,
  applyLiveQuotes,
  changePct,
  firstFillDate,
  getPositionMetrics,
  getPortfolioStats,
  getTradingDeskStats,
  parseTradingBook,
  positionFromDraft,
  rebaseToPercent,
  resolvePreviousClose,
  seriesTotalPct,
  sliceByRange,
  sliceFrom,
  toPercentSeries,
  type TradingQuote,
} from "./trading";

function quote(partial: Partial<TradingQuote> & Pick<TradingQuote, "symbol" | "last">): TradingQuote {
  return {
    mark: partial.last,
    markSession: "regular",
    markTime: null,
    session: "open",
    previousClose: null,
    regularClose: null,
    dayClose: null,
    dayPct: null,
    regularPct: null,
    marketDate: null,
    dayHigh: null,
    dayLow: null,
    dayRangeHigh: null,
    dayRangeLow: null,
    volume: null,
    week52High: null,
    week52Low: null,
    time: null,
    prePrice: null,
    prePct: null,
    preTime: null,
    postPrice: null,
    postPct: null,
    postTime: null,
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

  const today = sliceByRange(equity, "1d", "2026-09-01");
  assert.deepEqual(
    today.map((point) => point.time),
    ["2026-08-31", "2026-09-01"],
  );
  const week = sliceByRange(equity, "1w", "2026-09-01");
  assert.equal(week[0]?.time, "2026-08-31");
  const all = sliceByRange(equity, "all", "2026-09-01");
  assert.deepEqual(
    all.map((point) => point.time),
    ["2026-08-31", "2026-09-01"],
  );
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

test("positions mark at the extended-hours print, and the day move follows it", () => {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8"));
  const book = parseTradingBook(raw);
  // Premarket: Yahoo still reports yesterday's close as `last`, so `mark` carries the pre print
  // and `dayClose` is that close — not the one before it.
  const quotes = {
    GM: quote({
      symbol: "GM",
      last: 87.22,
      mark: 86.59,
      markSession: "pre",
      session: "pre",
      previousClose: 84.87,
      regularClose: 87.22,
      dayClose: 87.22,
      dayPct: -0.722,
      regularPct: 2.769,
      prePrice: 86.59,
      prePct: -0.722,
    }),
  };
  const liveBook = applyLiveQuotes(book, {
    fetchedAt: "2026-09-04T14:00:00+02:00",
    session: "pre",
    stale: false,
    fxUsdSek: 9.61,
    quotes,
  });
  const gm = liveBook.positions.find((position) => position.symbol === "GM");
  assert.ok(gm);
  assert.equal(gm.last, 86.59);

  const metrics = getPositionMetrics(gm, liveBook, quotes);
  assert.equal(metrics.mark, 86.59);
  assert.equal(metrics.markSession, "pre");
  assert.ok(Math.abs(metrics.dayPct! + 0.722) < 0.001, `dayPct was ${metrics.dayPct}`);
  assert.ok(Math.abs(metrics.extendedPct! + 0.722) < 0.001);
  // One share, 86.59 against the 87.22 close.
  assert.ok(Math.abs(metrics.dayUsd + 0.63) < 0.001);
  assert.ok(Math.abs(metrics.pnlPct - 0.1387) < 0.001, `pnlPct was ${metrics.pnlPct}`);
});

test("target and stop progress read off the fill, both ways round", () => {
  const book = parseTradingBook(
    JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8")),
  );
  const long = positionFromDraft({
    symbol: "GM",
    shares: 1,
    fill: 86.47,
    stop: 83.42,
    target: 92.12,
    last: 89,
    filledAt: "2026-09-01T15:30:00+02:00",
  });
  const ahead = getPositionMetrics(long, book);
  // 2.53 of the 5.65 to target, and away from the stop entirely.
  assert.ok(Math.abs(ahead.targetProgressPct! - 44.78) < 0.05, `${ahead.targetProgressPct}`);
  assert.equal(ahead.stopProgressPct, 0);
  assert.ok(Math.abs(ahead.railPct! - 64.14) < 0.05, `${ahead.railPct}`);
  assert.ok(Math.abs(ahead.fillRailPct! - 35.06) < 0.05);
  assert.ok(Math.abs(ahead.rMultiple - 0.8295) < 0.001);
  assert.ok(Math.abs(ahead.plannedR! - 1.8525) < 0.001);
  assert.ok(Math.abs(ahead.rewardUsd - 3.12) < 0.001);
  assert.ok(Math.abs(ahead.openRiskUsd - 5.58) < 0.001);

  const stopped = getPositionMetrics({ ...long, last: 83 }, book);
  assert.equal(stopped.stopProgressPct, 100);
  assert.equal(stopped.targetProgressPct, 0);
  assert.equal(stopped.railPct, 0);
  assert.equal(stopped.openRiskUsd, 0);

  const short = positionFromDraft({
    symbol: "XYZ",
    side: "short",
    shares: 2,
    fill: 100,
    stop: 110,
    target: 90,
    last: 95,
    filledAt: "2026-09-01T15:30:00+02:00",
  });
  const shortMetrics = getPositionMetrics(short, book);
  assert.equal(shortMetrics.targetProgressPct, 50);
  assert.equal(shortMetrics.stopProgressPct, 0);
  assert.equal(shortMetrics.railPct, 75);
  assert.equal(shortMetrics.pnlPct, 5);
  assert.equal(shortMetrics.rMultiple, 0.5);
  assert.equal(shortMetrics.openRiskUsd, 30);
  assert.equal(shortMetrics.rewardUsd, 10);
});

test("stop and target percentages are re-derived, never inherited stale", () => {
  const position = positionFromDraft({
    symbol: "GM",
    shares: 1,
    fill: 100,
    stop: 95,
    stopPct: -42,
    target: 110,
    targetPct: 999,
    last: 100,
    pnlPct: 87,
    filledAt: "2026-09-01T15:30:00+02:00",
  });
  assert.equal(position.stopPct, -5);
  assert.equal(position.targetPct, 10);
  assert.equal(position.pnlPct, 0);

  // A percentage on its own still places the price.
  const fromPct = positionFromDraft({ symbol: "KO", shares: 1, fill: 100, stopPct: -4, targetPct: 8 });
  assert.equal(fromPct.stop, 96);
  assert.equal(fromPct.target, 108);
});

test("live candles land on the session the quote belongs to", () => {
  const charts = {
    GM: [
      { time: "2026-09-02", open: 84, high: 85, low: 83.5, close: 84.87 },
      { time: "2026-09-03", open: 85, high: 87.4, low: 85.1, close: 87.22 },
    ],
  };
  // Premarket on the 4th: the quote still describes the 3rd, so no fourth bar appears.
  const premarket = applyLiveCandles(charts, {
    fetchedAt: "2026-09-04T14:00:00+02:00",
    session: "pre",
    stale: false,
    fxUsdSek: 9.61,
    quotes: {
      GM: quote({
        symbol: "GM",
        last: 87.22,
        mark: 86.59,
        markSession: "pre",
        marketDate: "2026-09-03",
        dayHigh: 87.38,
        dayLow: 85.121,
      }),
    },
  });
  assert.deepEqual(premarket.GM.map((candle) => candle.time), ["2026-09-02", "2026-09-03"]);
  assert.equal(premarket.GM.at(-1)?.close, 87.22);
  assert.equal(premarket.GM.at(-1)?.high, 87.4);
  assert.equal(premarket.GM.at(-1)?.low, 85.1);

  // Once the session opens the quote carries the new date and a bar is added.
  const open = applyLiveCandles(charts, {
    fetchedAt: "2026-09-04T18:00:00+02:00",
    session: "open",
    stale: false,
    fxUsdSek: 9.61,
    quotes: {
      GM: quote({ symbol: "GM", last: 88.4, marketDate: "2026-09-04", dayHigh: 88.6, dayLow: 86.5 }),
    },
  });
  assert.deepEqual(open.GM.map((candle) => candle.time), ["2026-09-02", "2026-09-03", "2026-09-04"]);
  assert.deepEqual(open.GM.at(-1), { time: "2026-09-04", open: 87.22, high: 88.6, low: 86.5, close: 88.4 });
});

test("today's range maps onto the stop→target rail, whichever way the trade points", () => {
  const book = parseTradingBook(
    JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8")),
  );
  const long = positionFromDraft({
    symbol: "GM",
    shares: 1,
    fill: 86.47,
    stop: 83.42,
    target: 92.12,
    last: 89,
    filledAt: "2026-09-01T15:30:00+02:00",
  });
  const quotes = {
    GM: quote({ symbol: "GM", last: 89, mark: 89, dayRangeLow: 85.121, dayRangeHigh: 87.38 }),
  };
  const metrics = getPositionMetrics(long, book, quotes);
  // 8.70 of rail between 83.42 and 92.12.
  assert.ok(Math.abs(metrics.dayRailLowPct! - 19.55) < 0.05, `${metrics.dayRailLowPct}`);
  assert.ok(Math.abs(metrics.dayRailHighPct! - 45.52) < 0.05, `${metrics.dayRailHighPct}`);

  // A short runs the other way — the high price sits to the LEFT, nearer its stop — so the
  // rail bounds come back ordered by position, not by price.
  const short = positionFromDraft({
    symbol: "XYZ",
    side: "short",
    shares: 1,
    fill: 100,
    stop: 110,
    target: 90,
    last: 95,
    filledAt: "2026-09-01T15:30:00+02:00",
  });
  const shortMetrics = getPositionMetrics(short, book, {
    XYZ: quote({ symbol: "XYZ", last: 95, mark: 95, dayRangeLow: 94, dayRangeHigh: 104 }),
  });
  assert.equal(shortMetrics.railPct, 75);
  assert.equal(shortMetrics.dayRailLowPct, 30);
  assert.equal(shortMetrics.dayRailHighPct, 80);
});

test("a position with no range, or none to map it onto, simply has none", () => {
  const book = parseTradingBook(
    JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8")),
  );
  const noQuote = getPositionMetrics(
    positionFromDraft({ symbol: "GM", shares: 1, fill: 86.47, stop: 83.42, target: 92.12, last: 89 }),
    book,
  );
  assert.equal(noQuote.dayRailLowPct, null);
  assert.equal(noQuote.dayRailHighPct, null);

  const noTarget = getPositionMetrics(
    positionFromDraft({ symbol: "GM", shares: 1, fill: 86.47, last: 89 }),
    book,
    { GM: quote({ symbol: "GM", last: 89, dayRangeLow: 85, dayRangeHigh: 90 }) },
  );
  assert.equal(noTarget.railPct, null);
  assert.equal(noTarget.dayRailLowPct, null);
  assert.equal(noTarget.targetProgressPct, null);
});
