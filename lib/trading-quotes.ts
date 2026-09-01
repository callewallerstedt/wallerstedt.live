import { formatIsoDate, type TradingLiveSnapshot, type TradingQuote } from "@/lib/trading";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const FX_SYMBOL = "USDSEK=X";

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
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
    }>;
  };
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

async function fetchYahooChart(symbol: string): Promise<YahooChart> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=true`;
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
