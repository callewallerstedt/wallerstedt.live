import {
  formatIsoDate,
  TRADING_INDEXES,
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
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
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

function parseQuote(symbol: string, payload: YahooChart): TradingQuote | null {
  const meta = payload.chart?.result?.[0]?.meta;
  const last = asFinite(meta?.regularMarketPrice);
  if (!meta || last == null) return null;

  const dayPct = asFinite(meta.regularMarketChangePercent);
  const previousClose =
    asFinite(meta.previousClose) ??
    asFinite(meta.chartPreviousClose) ??
    (dayPct != null && dayPct !== -100 ? last / (1 + dayPct / 100) : null);

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
  };
}

async function fetchYahooChart(symbol: string, range = "5d"): Promise<YahooChart> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}&includePrePost=true`;
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

function usEquitySession(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const stamp = hour * 60 + minute;
  return stamp >= 9 * 60 + 30 && stamp < 16 * 60;
}

export async function fetchTradingLive(symbols: string[]): Promise<TradingLiveSnapshot> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const rows = await Promise.allSettled([
    ...unique.map(async (symbol) => [symbol, parseQuote(symbol, await fetchYahooChart(symbol))] as const),
    fetchYahooChart(FX_SYMBOL).then((payload) => ["__FX__", parseQuote(FX_SYMBOL, payload)] as const),
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
    if (quote.time) newest = Math.max(newest, Date.parse(quote.time));
  }

  const fetchedAt = new Date().toISOString();
  const session = usEquitySession() ? "open" : "closed";
  const ageMs = newest ? Date.now() - newest : Number.POSITIVE_INFINITY;

  return {
    fetchedAt,
    session,
    stale: unique.some((symbol) => !quotes[symbol]) || ageMs > 15 * 60 * 1000,
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
