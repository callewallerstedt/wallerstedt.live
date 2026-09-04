import assert from "node:assert/strict";
import test from "node:test";

import { parseQuote } from "./trading-quotes";

// One real September session on the NYSE clock, in epoch seconds.
const PRE_START = 1788508800; // 2026-09-04 04:00 ET
const OPEN = 1788528600; // 09:30 ET
const CLOSE = 1788552000; // 16:00 ET
const POST_END = 1788566400; // 20:00 ET
const YESTERDAY_CLOSE = 1788465603; // 2026-09-03 16:00 ET

const PERIODS = {
  pre: { start: PRE_START, end: OPEN },
  regular: { start: OPEN, end: CLOSE },
  post: { start: CLOSE, end: POST_END },
};

function payload({
  regularMarketPrice,
  regularMarketTime,
  previousClose,
  regularMarketChangePercent,
  prints = [] as Array<[number, number]>,
}: {
  regularMarketPrice: number;
  regularMarketTime: number;
  previousClose: number;
  regularMarketChangePercent: number;
  prints?: Array<[number, number]>;
}) {
  return {
    chart: {
      result: [
        {
          meta: {
            symbol: "GM",
            exchangeTimezoneName: "America/New_York",
            regularMarketPrice,
            regularMarketTime,
            previousClose,
            regularMarketChangePercent,
            regularMarketDayHigh: 87.38,
            regularMarketDayLow: 85.121,
            fiftyTwoWeekHigh: 91.85,
            fiftyTwoWeekLow: 54.33,
            currentTradingPeriod: PERIODS,
            tradingPeriods: {
              pre: [[PERIODS.pre]],
              regular: [[PERIODS.regular]],
              post: [[PERIODS.post]],
            },
          },
          timestamp: prints.map(([time]) => time),
          indicators: { quote: [{ close: prints.map(([, close]) => close) }] },
        },
      ],
    },
  };
}

// Before the opening bell Yahoo still reports the previous session in every regularMarket*
// field, so premarket has to be measured against `regularMarketPrice`, not `previousClose`.
const BEFORE_OPEN = {
  regularMarketPrice: 87.22,
  regularMarketTime: YESTERDAY_CLOSE,
  previousClose: 84.87,
  regularMarketChangePercent: 2.769,
  prints: [[PRE_START + 3600, 86.59]] as Array<[number, number]>,
};

test("premarket is measured from the last regular close", () => {
  const quote = parseQuote("GM", payload(BEFORE_OPEN), PRE_START + 3700);
  assert.ok(quote);
  assert.equal(quote.session, "pre");
  assert.equal(quote.markSession, "pre");
  assert.equal(quote.mark, 86.59);
  assert.equal(quote.last, 87.22);
  assert.equal(quote.regularClose, 87.22);
  assert.equal(quote.dayClose, 87.22);
  assert.equal(quote.marketDate, "2026-09-03");
  assert.ok(Math.abs(quote.prePct! + 0.7222) < 0.001, `prePct was ${quote.prePct}`);
  // The day move is the premarket move — not yesterday's +2.77%, which stays on regularPct.
  assert.ok(Math.abs(quote.dayPct! + 0.7222) < 0.001, `dayPct was ${quote.dayPct}`);
  assert.equal(quote.regularPct, 2.769);
  assert.equal(quote.postPrice, null);
});

test("a premarket session with no prints yet holds the day flat", () => {
  const quote = parseQuote("GM", payload({ ...BEFORE_OPEN, prints: [] }), PRE_START + 60);
  assert.ok(quote);
  assert.equal(quote.session, "pre");
  assert.equal(quote.markSession, "regular");
  assert.equal(quote.mark, 87.22);
  assert.equal(quote.prePrice, null);
  assert.equal(quote.dayPct, 0);
});

test("an open session prices off the live print and keeps this morning's premarket", () => {
  const quote = parseQuote(
    "GM",
    payload({
      regularMarketPrice: 88.1,
      regularMarketTime: OPEN + 9000,
      previousClose: 87.22,
      regularMarketChangePercent: 1.0089,
      prints: [
        [PRE_START + 3600, 86.59],
        [OPEN + 9000, 88.1],
      ],
    }),
    OPEN + 9060,
  );
  assert.ok(quote);
  assert.equal(quote.session, "open");
  assert.equal(quote.markSession, "regular");
  assert.equal(quote.mark, 88.1);
  // resolvePreviousClose trusts the printed percentage over Yahoo's rounded previousClose.
  assert.ok(Math.abs(quote.regularClose! - 87.22) < 0.001);
  assert.ok(Math.abs(quote.dayClose! - 87.22) < 0.001);
  assert.ok(Math.abs(quote.dayPct! - 1.0089) < 0.001);
  // Still measured from yesterday's close, which is now `previousClose`.
  assert.ok(Math.abs(quote.prePct! + 0.7222) < 0.001);
  assert.equal(quote.marketDate, "2026-09-04");
});

const AFTER_CLOSE = {
  regularMarketPrice: 88.5,
  regularMarketTime: CLOSE,
  previousClose: 87.22,
  regularMarketChangePercent: 1.4675,
  prints: [
    [PRE_START + 3600, 86.59],
    [OPEN + 9000, 88.1],
    [CLOSE + 1800, 89],
  ] as Array<[number, number]>,
};

test("after hours is measured from today's close, the day from yesterday's", () => {
  const quote = parseQuote("GM", payload(AFTER_CLOSE), CLOSE + 1860);
  assert.ok(quote);
  assert.equal(quote.session, "post");
  assert.equal(quote.markSession, "post");
  assert.equal(quote.mark, 89);
  assert.equal(quote.regularClose, 88.5);
  assert.ok(Math.abs(quote.postPct! - 0.5650) < 0.001, `postPct was ${quote.postPct}`);
  assert.ok(Math.abs(quote.dayPct! - 2.0408) < 0.001, `dayPct was ${quote.dayPct}`);
});

test("once after hours ends the mark falls back to the close, with the AH print kept", () => {
  const quote = parseQuote("GM", payload(AFTER_CLOSE), POST_END + 600);
  assert.ok(quote);
  assert.equal(quote.session, "closed");
  assert.equal(quote.markSession, "regular");
  assert.equal(quote.mark, 88.5);
  assert.equal(quote.postPrice, 89);
  assert.ok(Math.abs(quote.dayPct! - 1.4675) < 0.001);
});

test("prints outside a window never leak into it", () => {
  const quote = parseQuote(
    "GM",
    payload({ ...BEFORE_OPEN, prints: [[PRE_START - 7200, 86.1]] }),
    PRE_START + 3700,
  );
  assert.ok(quote);
  assert.equal(quote.prePrice, null);
  assert.equal(quote.markSession, "regular");
});

test("a quote without a price is dropped", () => {
  assert.equal(parseQuote("GM", { chart: { result: [{ meta: {} }] } }, OPEN), null);
  assert.equal(parseQuote("GM", {}, OPEN), null);
});

test("the day's range covers only what today has actually travelled", () => {
  // Before the bell that is the premarket alone — never yesterday's session high and low,
  // which is what regularMarketDayHigh/Low still hold at this hour.
  const premarket = parseQuote(
    "GM",
    payload({
      ...BEFORE_OPEN,
      prints: [
        [PRE_START + 1800, 86.2],
        [PRE_START + 2400, 86.9],
        [PRE_START + 3600, 86.59],
      ],
    }),
    PRE_START + 3700,
  );
  assert.ok(premarket);
  assert.equal(premarket.dayRangeLow, 86.2);
  assert.equal(premarket.dayRangeHigh, 86.9);

  // Once it has rung, the regular session and both extended windows all count.
  const evening = parseQuote("GM", payload(AFTER_CLOSE), CLOSE + 1860);
  assert.ok(evening);
  assert.equal(evening.dayRangeLow, 85.121);
  assert.equal(evening.dayRangeHigh, 89);
});

test("a session with nothing printed yet has no range", () => {
  const quote = parseQuote("GM", payload({ ...BEFORE_OPEN, prints: [] }), PRE_START + 60);
  assert.ok(quote);
  assert.equal(quote.dayRangeHigh, null);
  assert.equal(quote.dayRangeLow, null);
});
