import {
  changePct,
  formatIsoDate,
  resolvePreviousClose,
  TRADING_INDEXES,
  usSessionPhase,
  type TradingCandle,
  type TradingIndexId,
  type TradingLiveSnapshot,
  type TradingPoint,
  type TradingQuote,
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

function latestWindow(periods: Array<Array<{ start?: number; end?: number }>> | undefined) {
  const last = periods?.at(-1)?.at(-1);
  const start = asFinite(last?.start);
  const end = asFinite(last?.end);
  if (start == null || end == null) return null;
  return { start, end };
}

function lastCloseInWindow(timestamps: number[], closes: Array<number | null | undefined>, start: number, end: number) {
  let last: { value: number; time: number } | null = null;
  for (let i = 0; i < timestamps.length; i += 1) {
    const time = timestamps[i];
    const close = closes[i];
    if (time == null || typeof close !== "number" || !Number.isFinite(close)) continue;
    if (time >= start && time < end) last = { value: close, time };
  }
  return last;
}

function parseQuote(symbol: string, payload: YahooChart): TradingQuote | null {
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const last = asFinite(meta?.regularMarketPrice);
  if (!meta || last == null) return null;

  const dayPct = asFinite(meta.regularMarketChangePercent);
  const previousClose = resolvePreviousClose(last, dayPct, asFinite(meta.previousClose));
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const preWindow = latestWindow(meta.tradingPeriods?.pre);
  const postWindow = latestWindow(meta.tradingPeriods?.post);
  const currentPre = meta.currentTradingPeriod?.pre;
  const livePreWindow =
    asFinite(currentPre?.start) != null && asFinite(currentPre?.end) != null
      ? { start: currentPre!.start!, end: currentPre!.end! }
      : preWindow;
  const pre = livePreWindow ? lastCloseInWindow(timestamps, closes, livePreWindow.start, livePreWindow.end) : null;
  const post = postWindow ? lastCloseInWindow(timestamps, closes, postWindow.start, postWindow.end) : null;
  const todayNy = formatIsoDate(new Date().toISOString(), "America/New_York");
  const preIsToday = pre != null && unixToDate(pre.time, "America/New_York") === todayNy;
  const postIsToday = post != null && unixToDate(post.time, "America/New_York") === todayNy;
  const showPre = usSessionPhase() === "pre" && preIsToday;

  return {
    symbol,
    last,
    previousClose,
    dayPct,
    dayHigh: asFinite(meta.regularMarketDayHigh),
    dayLow: asFinite(meta.regularMarketDayLow),
    volume: asFinite(meta.regularMarketVolume),
    week52High: asFinite(meta.fiftyTwoWeekHigh),
    week52Low: asFinite(meta.fiftyTwoWeekLow),
    time: toIso(meta.regularMarketTime),
    prePrice: showPre ? pre?.value ?? null : null,
    prePct: showPre && pre && previousClose ? Number(changePct(previousClose, pre.value).toFixed(4)) : null,
    preTime: showPre && pre ? toIso(pre.time) : null,
    preMark: preIsToday ? pre?.value ?? null : null,
    postPrice: postIsToday ? post?.value ?? null : null,
    postPct: postIsToday && post && previousClose ? Number(changePct(previousClose, post.value).toFixed(4)) : null,
    postMark: postIsToday ? post?.value ?? null : null,
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
  let newest = 0;

  for (const row of rows) {
    if (row.status !== "fulfilled" || !row.value[1]) continue;
    const [symbol, quote] = row.value;
    if (symbol === "__FX__") {
      fxUsdSek = quote.last;
      continue;
    }
    quotes[symbol] = quote;
    for (const stamp of [quote.time, quote.preTime]) {
      if (stamp) newest = Math.max(newest, Date.parse(stamp));
    }
  }

  const fetchedAt = new Date().toISOString();
  const session = usSessionPhase();
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

export function liveQuoteDay(live: TradingLiveSnapshot, timeZone: string) {
  return formatIsoDate(live.fetchedAt, timeZone);
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
