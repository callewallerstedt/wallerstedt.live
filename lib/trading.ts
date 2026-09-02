export const TRADING_TIMEZONE = "Europe/Berlin";

export type TradingSide = "long" | "short";

export type TradingPosition = {
  symbol: string;
  name: string;
  side: TradingSide;
  shares: number;
  fill: number;
  filledAt: string;
  stop: number;
  stopPct: number;
  target: number;
  targetPct: number;
  last: number;
  pnlPct: number;
};

export type ClosedTrade = {
  symbol: string;
  name: string;
  side: TradingSide;
  shares: number;
  fill: number;
  exit: number;
  pnlPct: number;
  result: "win" | "loss";
  closedAt: string;
};

export type TradingPortfolio = {
  id: string;
  name: string;
  style: string;
  capitalSek: number;
  symbols: string[];
};

export type TradingBook = {
  version: number;
  updatedAt: string;
  timezone: string;
  experiment: {
    title: string;
    operator: string;
    style: string;
    capitalSek: number;
    rules: string[];
  };
  fxUsdSek: number;
  portfolios: TradingPortfolio[];
  positions: TradingPosition[];
  closed: ClosedTrade[];
  stats: {
    openPnlSek: number | null;
    wins: number | null;
    losses: number | null;
  };
};

export type TradingCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type TradingChartFile = {
  symbol: string;
  interval: string;
  candles: TradingCandle[];
};

export type TradingPoint = {
  time: string;
  value: number;
};

export const TRADING_INDEXES = [
  { id: "spx", yahoo: "^GSPC", label: "S&P 500", color: "#9bbcff" },
  { id: "nasdaq", yahoo: "^IXIC", label: "Nasdaq", color: "#c4b5fd" },
  { id: "omx", yahoo: "^OMX", label: "OMX 30", color: "#e0bd85" },
  { id: "dji", yahoo: "^DJI", label: "Dow", color: "#8ad4e8" },
] as const;

export type TradingIndexId = (typeof TRADING_INDEXES)[number]["id"];

export type TradingQuote = {
  symbol: string;
  last: number;
  previousClose: number | null;
  dayPct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  week52High: number | null;
  week52Low: number | null;
  time: string | null;
};

export type TradingLiveSnapshot = {
  fetchedAt: string;
  session: "open" | "closed";
  stale: boolean;
  fxUsdSek: number | null;
  quotes: Record<string, TradingQuote>;
};

export type TradingDeskStats = {
  equitySek: number;
  openPnlSek: number;
  openPnlUsd: number;
  costUsd: number;
  costSek: number;
  marketUsd: number;
  marketSek: number;
  dayPnlUsd: number;
  dayPnlSek: number;
  cashSek: number;
  exposurePct: number;
  notionalUsd: number;
  notionalSek: number;
  namesHeld: string[];
  wins: number | null;
  losses: number | null;
};

export type TradingPositionMetrics = {
  marketUsd: number;
  marketSek: number;
  costUsd: number;
  costSek: number;
  pnlUsd: number;
  pnlSek: number;
  pnlPct: number;
  dayUsd: number;
  daySek: number;
  dayPct: number | null;
  weightPct: number;
  stopDistPct: number;
  targetDistPct: number;
  rMultiple: number;
  riskUsd: number;
  riskSek: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function parseTradingBook(value: unknown): TradingBook {
  if (!isRecord(value)) {
    throw new Error("Trading book must be an object");
  }

  const experiment = isRecord(value.experiment) ? value.experiment : {};
  const stats = isRecord(value.stats) ? value.stats : {};
  const capitalSek = asNumber(experiment.capitalSek, 5000);
  const positions = Array.isArray(value.positions) ? value.positions.map(parsePosition) : [];
  const portfolios = Array.isArray(value.portfolios)
    ? value.portfolios.map((row) => parsePortfolio(row, capitalSek, asString(experiment.style)))
    : [
        {
          id: "live",
          name: asString(experiment.title, "Rayner live"),
          style: asString(experiment.style, "long-only swing"),
          capitalSek,
          symbols: positions.map((position) => position.symbol),
        },
      ];

  return {
    version: asNumber(value.version, 1),
    updatedAt: asString(value.updatedAt),
    timezone: asString(value.timezone, TRADING_TIMEZONE),
    experiment: {
      title: asString(experiment.title, "Rayner live"),
      operator: asString(experiment.operator, "Rayner"),
      style: asString(experiment.style, "long-only swing"),
      capitalSek,
      rules: Array.isArray(experiment.rules) ? experiment.rules.map((rule) => String(rule)) : [],
    },
    fxUsdSek: asNumber(value.fxUsdSek, 9.61),
    portfolios,
    positions,
    closed: Array.isArray(value.closed) ? value.closed.map(parseClosed) : [],
    stats: {
      openPnlSek: typeof stats.openPnlSek === "number" ? stats.openPnlSek : null,
      wins: typeof stats.wins === "number" ? stats.wins : null,
      losses: typeof stats.losses === "number" ? stats.losses : null,
    },
  };
}

function parsePortfolio(value: unknown, fallbackCapital: number, fallbackStyle: string): TradingPortfolio {
  const row = isRecord(value) ? value : {};
  return {
    id: asString(row.id, "live"),
    name: asString(row.name, "Rayner live"),
    style: asString(row.style, fallbackStyle),
    capitalSek: asNumber(row.capitalSek, fallbackCapital),
    symbols: Array.isArray(row.symbols) ? row.symbols.map((symbol) => String(symbol).toUpperCase()) : [],
  };
}

function parsePosition(value: unknown): TradingPosition {
  const row = isRecord(value) ? value : {};
  const fill = asNumber(row.fill);
  const last = asNumber(row.last, fill);
  const shares = asNumber(row.shares, 1);
  const side = row.side === "short" ? "short" : "long";
  const computedPct = fill === 0 ? 0 : ((last - fill) / fill) * 100 * (side === "short" ? -1 : 1);

  return {
    symbol: asString(row.symbol).toUpperCase(),
    name: asString(row.name, asString(row.symbol).toUpperCase()),
    side,
    shares,
    fill,
    filledAt: asString(row.filledAt),
    stop: asNumber(row.stop),
    stopPct: asNumber(row.stopPct),
    target: asNumber(row.target),
    targetPct: asNumber(row.targetPct),
    last,
    pnlPct: typeof row.pnlPct === "number" ? row.pnlPct : Number(computedPct.toFixed(1)),
  };
}

function parseClosed(value: unknown): ClosedTrade {
  const row = isRecord(value) ? value : {};
  return {
    symbol: asString(row.symbol).toUpperCase(),
    name: asString(row.name, asString(row.symbol).toUpperCase()),
    side: row.side === "short" ? "short" : "long",
    shares: asNumber(row.shares, 1),
    fill: asNumber(row.fill),
    exit: asNumber(row.exit),
    pnlPct: asNumber(row.pnlPct),
    result: row.result === "loss" ? "loss" : "win",
    closedAt: asString(row.closedAt),
  };
}

export function positionPnlUsd(position: TradingPosition, mark = position.last) {
  const delta = mark - position.fill;
  return (position.side === "short" ? -delta : delta) * position.shares;
}

export function positionPnlSek(position: TradingPosition, fxUsdSek: number, mark = position.last) {
  return positionPnlUsd(position, mark) * fxUsdSek;
}

export function getPortfolioStats(book: TradingBook, portfolio: TradingPortfolio): TradingDeskStats {
  const held = portfolioPositions(book, portfolio);
  const sameBook = held.length === book.positions.length;
  return getTradingDeskStats({
    ...book,
    experiment: { ...book.experiment, capitalSek: portfolio.capitalSek },
    positions: held,
    stats: {
      ...book.stats,
      openPnlSek: sameBook ? book.stats.openPnlSek : null,
    },
  });
}

export function getTradingDeskStats(book: TradingBook, quotes: Record<string, TradingQuote> = {}): TradingDeskStats {
  const openPnlUsd = book.positions.reduce((sum, position) => sum + positionPnlUsd(position), 0);
  const costUsd = book.positions.reduce((sum, position) => sum + position.fill * position.shares, 0);
  const marketUsd = book.positions.reduce((sum, position) => sum + position.last * position.shares, 0);
  const dayPnlUsd = book.positions.reduce((sum, position) => sum + positionDayPnlUsd(position, quotes[position.symbol]), 0);
  const openPnlSek = openPnlUsd * book.fxUsdSek;
  const costSek = costUsd * book.fxUsdSek;
  const marketSek = marketUsd * book.fxUsdSek;

  return {
    equitySek: book.experiment.capitalSek + openPnlSek,
    openPnlSek,
    openPnlUsd,
    costUsd,
    costSek,
    marketUsd,
    marketSek,
    dayPnlUsd,
    dayPnlSek: dayPnlUsd * book.fxUsdSek,
    cashSek: book.experiment.capitalSek - costSek,
    exposurePct: book.experiment.capitalSek ? (marketSek / book.experiment.capitalSek) * 100 : 0,
    notionalUsd: costUsd,
    notionalSek: costSek,
    namesHeld: book.positions.map((position) => position.symbol),
    wins: book.stats.wins,
    losses: book.stats.losses,
  };
}

export function positionDayPnlUsd(position: TradingPosition, quote?: TradingQuote) {
  const previous = quote?.previousClose;
  if (previous == null || !Number.isFinite(previous)) return 0;
  const delta = position.last - previous;
  return (position.side === "short" ? -delta : delta) * position.shares;
}

export function getPositionMetrics(
  position: TradingPosition,
  book: TradingBook,
  quotes: Record<string, TradingQuote> = {},
  marketUsdTotal = 0,
): TradingPositionMetrics {
  const quote = quotes[position.symbol];
  const pnlUsd = positionPnlUsd(position);
  const costUsd = position.fill * position.shares;
  const marketUsd = position.last * position.shares;
  const riskUsd = Math.abs(position.fill - position.stop) * position.shares;
  const stopDistPct = position.last ? ((position.stop - position.last) / position.last) * 100 : 0;
  const targetDistPct = position.last ? ((position.target - position.last) / position.last) * 100 : 0;
  const riskPerShare = Math.abs(position.fill - position.stop);
  const rMultiple = riskPerShare ? (position.last - position.fill) / riskPerShare * (position.side === "short" ? -1 : 1) : 0;

  return {
    marketUsd,
    marketSek: marketUsd * book.fxUsdSek,
    costUsd,
    costSek: costUsd * book.fxUsdSek,
    pnlUsd,
    pnlSek: pnlUsd * book.fxUsdSek,
    pnlPct: position.fill ? ((position.last - position.fill) / position.fill) * 100 * (position.side === "short" ? -1 : 1) : 0,
    dayUsd: positionDayPnlUsd(position, quote),
    daySek: positionDayPnlUsd(position, quote) * book.fxUsdSek,
    dayPct: quote?.dayPct ?? null,
    weightPct: marketUsdTotal ? (marketUsd / marketUsdTotal) * 100 : 0,
    stopDistPct,
    targetDistPct,
    rMultiple,
    riskUsd,
    riskSek: riskUsd * book.fxUsdSek,
  };
}

export function applyLiveQuotes(book: TradingBook, live: TradingLiveSnapshot | null): TradingBook {
  if (!live) return book;
  const fxUsdSek = live.fxUsdSek && live.fxUsdSek > 0 ? live.fxUsdSek : book.fxUsdSek;

  return {
    ...book,
    updatedAt: live.fetchedAt || book.updatedAt,
    fxUsdSek,
    positions: book.positions.map((position) => {
      const quote = live.quotes[position.symbol];
      if (!quote?.last) return position;
      const last = quote.last;
      const pnlPct = position.fill ? Number((((last - position.fill) / position.fill) * 100 * (position.side === "short" ? -1 : 1)).toFixed(2)) : 0;
      return { ...position, last, pnlPct };
    }),
    stats: { ...book.stats, openPnlSek: null },
  };
}

export function applyLiveCandles(
  charts: Record<string, TradingCandle[]>,
  live: TradingLiveSnapshot | null,
  timeZone = TRADING_TIMEZONE,
): Record<string, TradingCandle[]> {
  if (!live) return charts;
  const today = formatIsoDate(live.fetchedAt || new Date().toISOString(), timeZone);
  const next: Record<string, TradingCandle[]> = {};

  for (const [symbol, candles] of Object.entries(charts)) {
    const quote = live.quotes[symbol];
    if (!quote?.last) {
      next[symbol] = candles;
      continue;
    }
    const last = candles.at(-1);
    if (last && last.time === today) {
      next[symbol] = [
        ...candles.slice(0, -1),
        {
          ...last,
          close: quote.last,
          high: Math.max(last.high, quote.dayHigh ?? quote.last, quote.last),
          low: Math.min(last.low, quote.dayLow ?? quote.last, quote.last),
        },
      ];
      continue;
    }
    next[symbol] = [
      ...candles,
      {
        time: today,
        open: quote.previousClose ?? last?.close ?? quote.last,
        high: quote.dayHigh ?? quote.last,
        low: quote.dayLow ?? quote.last,
        close: quote.last,
      },
    ];
  }

  return next;
}

export function stampLiveEquity(points: TradingPoint[], book: TradingBook, quotes: Record<string, TradingQuote> = {}): TradingPoint[] {
  const stats = getTradingDeskStats(book, quotes);
  const today = formatIsoDate(book.updatedAt || new Date().toISOString(), book.timezone);
  const value = Number(stats.equitySek.toFixed(2));
  if (points.length === 0) return [{ time: today, value }];
  const last = points.at(-1)!;
  if (last.time >= today) {
    return [...points.slice(0, -1), { time: last.time, value }];
  }
  return [...points, { time: today, value }];
}

export function formatIsoDate(iso: string, timeZone = TRADING_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function changePct(start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return 0;
  return ((end - start) / Math.abs(start)) * 100;
}

export function toPercentSeries(points: TradingPoint[]): TradingPoint[] {
  const start = points.find((point) => Number.isFinite(point.value) && point.value !== 0)?.value;
  if (start == null) return [];
  return points.map((point) => ({
    time: point.time,
    value: Number(changePct(start, point.value).toFixed(4)),
  }));
}

export function rebaseToPercent(points: TradingPoint[], startTime: string): TradingPoint[] {
  const baseline =
    [...points].reverse().find((point) => point.time <= startTime && point.value !== 0) ??
    points.find((point) => point.time >= startTime && point.value !== 0);
  if (!baseline) return [];
  const series = points
    .filter((point) => point.time >= startTime)
    .map((point) => ({
      time: point.time,
      value: Number(changePct(baseline.value, point.value).toFixed(4)),
    }));
  if (series[0] && series[0].time !== startTime) {
    return [{ time: startTime, value: 0 }, ...series];
  }
  return series;
}

export function seriesTotalPct(points: TradingPoint[]) {
  const start = points.find((point) => Number.isFinite(point.value) && point.value !== 0);
  const end = [...points].reverse().find((point) => Number.isFinite(point.value));
  if (!start || !end) return 0;
  return changePct(start.value, end.value);
}

export function firstFillDate(book: TradingBook) {
  const dates = [
    ...book.positions.map((position) => position.filledAt.slice(0, 10)),
    ...book.closed.map((trade) => trade.closedAt.slice(0, 10)),
  ].filter(Boolean).sort();
  return dates[0];
}

export function sliceFrom(points: TradingPoint[], startTime?: string) {
  if (!startTime || points.length === 0) return points;
  const before = [...points].reverse().find((point) => point.time < startTime && point.value !== 0);
  const fromStart = points.filter((point) => point.time >= startTime);
  if (!fromStart.length) return before ? [before] : points;
  if (before && fromStart[0]?.time !== before.time) return [before, ...fromStart];
  return fromStart;
}

export function alignedReturnPct(subject: TradingPoint[], benchmark: TradingPoint[]) {
  const startTime = subject.find((point) => Number.isFinite(point.value))?.time;
  if (!startTime) return { subjectPct: 0, benchmarkPct: 0, alpha: 0 };
  const subjectPct = seriesTotalPct(subject);
  const benchmarkPct = rebaseToPercent(benchmark, startTime).at(-1)?.value ?? 0;
  return {
    subjectPct,
    benchmarkPct,
    alpha: Number((subjectPct - benchmarkPct).toFixed(4)),
  };
}

export function portfolioPositions(book: TradingBook, portfolio: TradingPortfolio) {
  const wanted = new Set(portfolio.symbols);
  return wanted.size ? book.positions.filter((position) => wanted.has(position.symbol)) : book.positions;
}

export function buildEquityCurve(
  book: TradingBook,
  charts: Record<string, TradingCandle[]>,
  symbols?: string[],
): TradingPoint[] {
  const held = symbols?.length ? book.positions.filter((position) => symbols.includes(position.symbol)) : book.positions;
  const closeBySymbol = new Map<string, Map<string, number>>();
  const dates = new Set<string>();

  for (const position of held) {
    const candles = charts[position.symbol] ?? [];
    const series = new Map<string, number>();
    for (const candle of candles) {
      series.set(candle.time, candle.close);
      dates.add(candle.time);
    }
    closeBySymbol.set(position.symbol, series);
  }

  const days = [...dates].sort();
  if (days.length === 0) {
    return [{ time: book.updatedAt.slice(0, 10), value: book.experiment.capitalSek + (book.stats.openPnlSek ?? 0) }];
  }

  const lastClose = new Map<string, number>();
  const points: TradingPoint[] = [];

  for (const day of days) {
    for (const position of held) {
      const close = closeBySymbol.get(position.symbol)?.get(day);
      if (close != null) lastClose.set(position.symbol, close);
    }

    let pnlUsd = 0;
    for (const position of held) {
      const fillDay = position.filledAt.slice(0, 10);
      if (day < fillDay) continue;
      const mark = lastClose.get(position.symbol) ?? position.fill;
      pnlUsd += positionPnlUsd(position, mark);
    }

    points.push({
      time: day,
      value: Number((book.experiment.capitalSek + pnlUsd * book.fxUsdSek).toFixed(2)),
    });
  }

  const last = points.at(-1);
  const stats = getTradingDeskStats(book);
  if (last && Math.abs(last.value - stats.equitySek) > 1) {
    last.value = Number(stats.equitySek.toFixed(2));
  }

  return points;
}

export function formatSek(value: number, digits = 0) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatSignedPct(value: number, digits = 1) {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function formatSignedNumber(value: number, digits = 0, suffix = "") {
  const abs = Math.abs(value).toLocaleString("sv-SE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const body = `${abs}${suffix}`;
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}

export function formatPrice(value: number) {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBerlinDateTime(iso: string, timeZone = TRADING_TIMEZONE) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatBerlinClock(iso: string, timeZone = TRADING_TIMEZONE) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function ema(values: number[], period: number) {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (values.length < period) return out;

  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  out[period - 1] = value;
  for (let i = period; i < values.length; i += 1) {
    value = values[i] * k + value * (1 - k);
    out[i] = value;
  }
  return out;
}

export function sma(values: number[], period: number) {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null);
  if (values.length < period) return out;

  let sum = values.slice(0, period).reduce((total, item) => total + item, 0);
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i += 1) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}
