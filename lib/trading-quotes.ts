import {
  changePct,
  resolvePreviousClose,
  TRADING_INDEXES,
  usSessionPhase,
  type TradingCandle,
  type TradingIndexId,
  type TradingLiveSnapshot,
  type TradingPoint,
  type TradingQuote,
  type TradingSession,
} from "@/lib/trading";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const FX_SYMBOL = "USDSEK=X";

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        exchangeTimezoneName?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketTime?: number;
        tradingPeriods?: Record<string, Array<Array<{ start?: number; end?: number }>>>;
        currentTradingPeriod?: Record<string, { start?: number; end?: number }>;
      };
      timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
          }>;
        };
    }>;
  };
};

export const TRADING_BENCHMARKS = TRADING_INDEXES;

export type TradingBenchmarkId = TradingIndexId;

export type TradingBenchmarkSeries = {
  id: TradingBenchmarkId;
  label: string;
  color: string;
  points: TradingPoint[];
};

function asFinite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIso(unix?: number) {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

type Window = { start: number; end: number };

function asWindow(period: { start?: number; end?: number } | undefined): Window | null {
  const start = asFinite(period?.start);
  const end = asFinite(period?.end);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

function latestWindow(periods: Array<Array<{ start?: number; end?: number }>> | undefined) {
  return asWindow(periods?.at(-1)?.at(-1));
}

function inWindow(window: Window | null, atSec: number) {
  return window != null && atSec >= window.start && atSec < window.end;
}

/** The exchange's own windows, so half-days and holidays land right without a hardcoded clock. */
function sessionFromWindows(pre: Window | null, regular: Window | null, post: Window | null, atSec: number): TradingSession | null {
  if (!pre && !regular && !post) return null;
  if (inWindow(regular, atSec)) return "open";
  if (inWindow(pre, atSec)) return "pre";
  if (inWindow(post, atSec)) return "post";
  return "closed";
}

function windowStats(timestamps: number[], closes: Array<number | null | undefined>, window: Window | null) {
  if (!window) return null;
  let last: { value: number; time: number } | null = null;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (let i = 0; i < timestamps.length; i += 1) {
    const time = timestamps[i];
    const close = closes[i];
    if (time == null || typeof close !== "number" || !Number.isFinite(close)) continue;
    if (time < window.start || time >= window.end) continue;
    last = { value: close, time };
    high = Math.max(high, close);
    low = Math.min(low, close);
  }
  return last ? { last, high, low } : null;
}

// Full precision on purpose: rounding here and again at the formatter turned one number
// into two, so the premarket badge read +0.3% next to a day column reading +0.2%.
function pct(from: number | null, to: number | null) {
  if (from == null || to == null || from === 0) return null;
  return changePct(from, to);
}

export function parseQuote(symbol: string, payload: YahooChart, atSec = Date.now() / 1000): TradingQuote | null {
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const last = asFinite(meta?.regularMarketPrice);
  if (!meta || last == null) return null;

  const zone = meta.exchangeTimezoneName || "America/New_York";
  const regularPct = asFinite(meta.regularMarketChangePercent);
  const previousClose = resolvePreviousClose(
    last,
    regularPct,
    asFinite(meta.previousClose) ?? asFinite(meta.chartPreviousClose),
  );
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const preWindow = asWindow(meta.currentTradingPeriod?.pre) ?? latestWindow(meta.tradingPeriods?.pre);
  const regularWindow = asWindow(meta.currentTradingPeriod?.regular) ?? latestWindow(meta.tradingPeriods?.regular);
  const postWindow = asWindow(meta.currentTradingPeriod?.post) ?? latestWindow(meta.tradingPeriods?.post);
  const regularTime = asFinite(meta.regularMarketTime);

  // Yahoo leaves regularMarketPrice, regularMarketChangePercent and previousClose on the last
  // completed session until the next opening bell. So before that bell `last` is yesterday's
  // close and `previousClose` is the day before that — which is why premarket has to be
  // measured against `last`, not against `previousClose`.
  const regularStarted = regularWindow != null && regularTime != null ? regularTime >= regularWindow.start : true;
  const regularDone = regularWindow != null && atSec >= regularWindow.end;
  const regularClose = regularStarted && !regularDone ? previousClose : last;

  // Premarket on day D is measured from the close of D-1; after hours on D from the close of D.
  const preBase = regularStarted ? previousClose : last;
  const postBase = regularStarted ? last : null;

  const preStats = windowStats(timestamps, closes, preWindow);
  const postStats = windowStats(timestamps, closes, postWindow);
  const pre = preStats?.last ?? null;
  const post = postStats?.last ?? null;
  const inPre = !regularStarted && pre != null && inWindow(preWindow, atSec);
  const inPost = regularDone && post != null && inWindow(postWindow, atSec);
  const markSession = inPre ? "pre" : inPost ? "post" : "regular";
  const mark = inPre ? pre!.value : inPost ? post!.value : last;
  const markTime = inPre ? toIso(pre!.time) : inPost ? toIso(post!.time) : toIso(meta.regularMarketTime);

  // Nothing has happened "today" until the premarket ticks, so hold the day move at the close
  // it starts from rather than reporting yesterday's session as if it were live.
  const dayClose = preBase;

  // The range covers whatever "today" already means here: only the premarket before the bell,
  // and the regular session plus both extended windows once it has rung.
  const travelled = [mark];
  if (regularStarted) {
    for (const edge of [asFinite(meta.regularMarketDayHigh), asFinite(meta.regularMarketDayLow)]) {
      if (edge != null) travelled.push(edge);
    }
    for (const stats of [preStats, postStats]) {
      if (stats) travelled.push(stats.high, stats.low);
    }
  } else if (preStats) {
    travelled.push(preStats.high, preStats.low);
  }
  const ranged = travelled.length > 1;

  return {
    symbol,
    last,
    mark,
    markSession,
    markTime,
    session: sessionFromWindows(preWindow, regularWindow, postWindow, atSec) ?? usSessionPhase(new Date(atSec * 1000)),
    previousClose,
    regularClose,
    dayClose,
    dayPct: pct(dayClose, mark),
    regularPct,
    marketDate: regularTime != null ? unixToDate(regularTime, zone) : null,
    dayHigh: asFinite(meta.regularMarketDayHigh),
    dayLow: asFinite(meta.regularMarketDayLow),
    dayRangeHigh: ranged ? Math.max(...travelled) : null,
    dayRangeLow: ranged ? Math.min(...travelled) : null,
    volume: asFinite(meta.regularMarketVolume),
    week52High: asFinite(meta.fiftyTwoWeekHigh),
    week52Low: asFinite(meta.fiftyTwoWeekLow),
    time: toIso(meta.regularMarketTime),
    prePrice: pre?.value ?? null,
    prePct: pre ? pct(preBase, pre.value) : null,
    preTime: pre ? toIso(pre.time) : null,
    postPrice: post?.value ?? null,
    postPct: post ? pct(postBase, post.value) : null,
    postTime: post ? toIso(post.time) : null,
  };
}

async function fetchYahooChart(symbol: string, range = "5d", interval = "1d"): Promise<YahooChart> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=true`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; WallerstedtDesk/1.0)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Quote ${symbol} failed (${response.status})`);
  }
  return (await response.json()) as YahooChart;
}

export async function fetchTradingLive(symbols: string[]): Promise<TradingLiveSnapshot> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const rows = await Promise.allSettled([
    ...unique.map(async (symbol) => [symbol, parseQuote(symbol, await fetchYahooChart(symbol, "1d", "1m"))] as const),
    fetchYahooChart(FX_SYMBOL, "1d", "1m").then((payload) => ["__FX__", parseQuote(FX_SYMBOL, payload)] as const),
  ]);

  const quotes: Record<string, TradingQuote> = {};
  let fxUsdSek: number | null = null;
  let session: TradingSession | null = null;
  let newest = 0;

  for (const row of rows) {
    if (row.status !== "fulfilled" || !row.value[1]) continue;
    const [symbol, quote] = row.value;
    if (symbol === "__FX__") {
      // FX trades around the clock, so its windows say nothing about the equity session.
      fxUsdSek = quote.mark;
      continue;
    }
    quotes[symbol] = quote;
    session ??= quote.session;
    if (quote.markTime) newest = Math.max(newest, Date.parse(quote.markTime));
  }

  const fetchedAt = new Date().toISOString();
  session ??= usSessionPhase();
  const staleMinutes = session === "pre" || session === "post" ? 20 : 15;
  const ageMs = newest ? Date.now() - newest : Number.POSITIVE_INFINITY;

  return {
    fetchedAt,
    session,
    stale: unique.some((symbol) => !quotes[symbol]) || ageMs > staleMinutes * 60 * 1000,
    fxUsdSek,
    quotes,
  };
}

function unixToDate(unix: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unix * 1000));
}

function parseHistory(payload: YahooChart) {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const timeZone = result?.meta?.exchangeTimezoneName || "UTC";
  const points: Array<{ time: string; value: number }> = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    points.push({ time: unixToDate(timestamps[i]!, timeZone), value: close });
  }
  return points;
}

let benchmarkCache: { at: number; series: TradingBenchmarkSeries[] } | null = null;

export async function fetchTradingBenchmarks(): Promise<TradingBenchmarkSeries[]> {
  if (benchmarkCache && Date.now() - benchmarkCache.at < 5 * 60 * 1000) {
    return benchmarkCache.series;
  }

  const rows = await Promise.allSettled(
    TRADING_BENCHMARKS.map(async (benchmark) => {
      const payload = await fetchYahooChart(benchmark.yahoo, "2y");
      return {
        id: benchmark.id,
        label: benchmark.label,
        color: benchmark.color,
        points: parseHistory(payload),
      } satisfies TradingBenchmarkSeries;
    }),
  );

  const series = rows.flatMap((row) => (row.status === "fulfilled" && row.value.points.length ? [row.value] : []));
  if (series.length) {
    benchmarkCache = { at: Date.now(), series };
  }
  return series;
}

export async function fetchTradingDailyCandles(symbol: string): Promise<TradingCandle[]> {
  const payload = await fetchYahooChart(symbol, "2y", "1d");
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const timeZone = result?.meta?.exchangeTimezoneName || "UTC";
  const candles: TradingCandle[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = quote?.open?.[i];
    const high = quote?.high?.[i];
    const low = quote?.low?.[i];
    const close = quote?.close?.[i];
    if ([open, high, low, close].some((value) => typeof value !== "number" || !Number.isFinite(value))) continue;
    candles.push({
      time: unixToDate(timestamps[i]!, timeZone),
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
    });
  }
  return candles;
}
