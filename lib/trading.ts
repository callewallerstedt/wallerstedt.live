export const TRADING_TIMEZONE = "Europe/Berlin";
/** The book holds US names, so a trading day starts and ends on the exchange's clock. */
export const TRADING_MARKET_TIMEZONE = "America/New_York";

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

export type TradingSession = "pre" | "open" | "post" | "closed";

export type TradingMarkSession = "pre" | "regular" | "post";

export type TradingQuote = {
  symbol: string;
  /** Last regular-session print: live while the market is open, otherwise that session's close. */
  last: number;
  /** What the position is worth right now — the extended-hours print during pre/after hours. */
  mark: number;
  markSession: TradingMarkSession;
  markTime: string | null;
  session: TradingSession;
  /** Close of the session before the one `last` belongs to. */
  previousClose: number | null;
  /** Last completed regular close — the baseline every extended-hours move is measured from. */
  regularClose: number | null;
  /** Baseline for "today" on `mark`. */
  dayClose: number | null;
  /** `mark` against `dayClose` — the live day move, extended hours included. */
  dayPct: number | null;
  /** The regular session's own move, `last` against `previousClose`. */
  regularPct: number | null;
  /** Exchange-local date `last` belongs to. */
  marketDate: string | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  week52High: number | null;
  week52Low: number | null;
  time: string | null;
  prePrice: number | null;
  prePct: number | null;
  preTime: string | null;
  postPrice: number | null;
  postPct: number | null;
  postTime: string | null;
};

export type TradingLiveSnapshot = {
  fetchedAt: string;
  session: TradingSession;
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
  mark: number;
  markSession: TradingMarkSession;
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
  prePrice: number | null;
  prePct: number | null;
  postPrice: number | null;
  postPct: number | null;
  /** The extended-hours print that is live right now, if any. */
  extendedPrice: number | null;
  extendedPct: number | null;
  weightPct: number;
  /** Move still needed, from the mark, to reach the stop or the target. */
  stopDistPct: number | null;
  targetDistPct: number | null;
  /** How far the trade has travelled from the fill toward each side, 0–100. */
  targetProgressPct: number | null;
  stopProgressPct: number | null;
  /** Where the mark and the fill sit on the stop→target rail, 0–100. */
  railPct: number | null;
  fillRailPct: number | null;
  rMultiple: number;
  plannedR: number | null;
  riskUsd: number;
  riskSek: number;
  openRiskUsd: number;
  openRiskSek: number;
  rewardUsd: number;
  rewardSek: number;
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

  // A price wins over a stored percentage, and both percentages are re-derived on every read:
  // a stop moved by the agent used to leave the old stopPct sitting next to it.
  const stopPctSeed = asNumber(row.stopPct);
  const targetPctSeed = asNumber(row.targetPct);
  const stop = asNumber(row.stop) || (fill && stopPctSeed ? Number((fill * (1 + stopPctSeed / 100)).toFixed(2)) : 0);
  const target = asNumber(row.target) || (fill && targetPctSeed ? Number((fill * (1 + targetPctSeed / 100)).toFixed(2)) : 0);

  return {
    symbol: asString(row.symbol).toUpperCase(),
    name: asString(row.name, asString(row.symbol).toUpperCase()),
    side,
    shares,
    fill,
    filledAt: asString(row.filledAt),
    stop,
    stopPct: fill && stop ? Number((((stop - fill) / fill) * 100).toFixed(2)) : 0,
    target,
    targetPct: fill && target ? Number((((target - fill) / fill) * 100).toFixed(2)) : 0,
    last,
    pnlPct: fill ? Number((((last - fill) / fill) * 100 * (side === "short" ? -1 : 1)).toFixed(2)) : 0,
  };
}

export function positionFromDraft(value: unknown, now = new Date()): TradingPosition {
  const row = isRecord(value) ? value : {};
  return parsePosition({
    ...row,
    filledAt: asString(row.filledAt, now.toISOString()),
    last: asNumber(row.last, asNumber(row.fill)),
  });
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

export function quoteMark(quote?: TradingQuote) {
  if (!quote) return null;
  const mark = quote.mark ?? quote.last;
  return Number.isFinite(mark) && mark > 0 ? mark : null;
}

/** The close "today" is measured from. Fresh quotes carry it; older snapshots imply it. */
export function quoteDayClose(quote?: TradingQuote) {
  if (!quote) return null;
  if (quote.dayClose != null && Number.isFinite(quote.dayClose) && quote.dayClose !== 0) return quote.dayClose;
  return resolvePreviousClose(quoteMark(quote) ?? quote.last, quote.dayPct ?? null, quote.previousClose ?? null);
}

export function positionDayPnlUsd(position: TradingPosition, quote?: TradingQuote) {
  const previous = quoteDayClose(quote);
  if (previous == null) return 0;
  const delta = position.last - previous;
  return (position.side === "short" ? -delta : delta) * position.shares;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getPositionMetrics(
  position: TradingPosition,
  book: TradingBook,
  quotes: Record<string, TradingQuote> = {},
  marketUsdTotal = 0,
): TradingPositionMetrics {
  const quote = quotes[position.symbol];
  const markSession = quote?.markSession ?? "regular";
  // position.last is already the live mark: applyLiveQuotes stamps the extended print onto it.
  const mark = position.last;
  const sign = position.side === "short" ? -1 : 1;
  const move = mark - position.fill;
  const pnlUsd = positionPnlUsd(position);
  const costUsd = position.fill * position.shares;
  const marketUsd = mark * position.shares;
  const riskPerShare = Math.abs(position.fill - position.stop);
  const riskUsd = riskPerShare * position.shares;

  // Signed spans, so a short (target below the fill, stop above it) falls out of the same math.
  const targetSpan = position.target ? position.target - position.fill : 0;
  const stopSpan = position.stop ? position.stop - position.fill : 0;
  const rail = position.target && position.stop ? position.target - position.stop : 0;
  const openRiskUsd = position.stop ? Math.max(0, (mark - position.stop) * sign) * position.shares : 0;
  const rewardUsd = position.target ? Math.max(0, (position.target - mark) * sign) * position.shares : 0;

  const dayUsd = positionDayPnlUsd(position, quote);
  const dayClose = quoteDayClose(quote);
  const extendedPrice =
    markSession === "pre" ? quote?.prePrice ?? null : markSession === "post" ? quote?.postPrice ?? null : null;
  const extendedPct =
    markSession === "pre" ? quote?.prePct ?? null : markSession === "post" ? quote?.postPct ?? null : null;

  return {
    mark,
    markSession,
    marketUsd,
    marketSek: marketUsd * book.fxUsdSek,
    costUsd,
    costSek: costUsd * book.fxUsdSek,
    pnlUsd,
    pnlSek: pnlUsd * book.fxUsdSek,
    pnlPct: position.fill ? (move / position.fill) * 100 * sign : 0,
    dayUsd,
    daySek: dayUsd * book.fxUsdSek,
    dayPct: dayClose != null ? changePct(dayClose, mark) : null,
    prePrice: quote?.prePrice ?? null,
    prePct: quote?.prePct ?? null,
    postPrice: quote?.postPrice ?? null,
    postPct: quote?.postPct ?? null,
    extendedPrice,
    extendedPct,
    weightPct: marketUsdTotal ? (marketUsd / marketUsdTotal) * 100 : 0,
    stopDistPct: position.stop && mark ? ((position.stop - mark) / mark) * 100 : null,
    targetDistPct: position.target && mark ? ((position.target - mark) / mark) * 100 : null,
    targetProgressPct: targetSpan ? clamp((move / targetSpan) * 100, 0, 100) : null,
    stopProgressPct: stopSpan ? clamp((move / stopSpan) * 100, 0, 100) : null,
    railPct: rail ? clamp(((mark - position.stop) / rail) * 100, 0, 100) : null,
    fillRailPct: rail ? clamp(((position.fill - position.stop) / rail) * 100, 0, 100) : null,
    rMultiple: riskPerShare ? (move * sign) / riskPerShare : 0,
    plannedR: stopSpan && targetSpan ? Math.abs(targetSpan) / Math.abs(stopSpan) : null,
    riskUsd,
    riskSek: riskUsd * book.fxUsdSek,
    openRiskUsd,
    openRiskSek: openRiskUsd * book.fxUsdSek,
    rewardUsd,
    rewardSek: rewardUsd * book.fxUsdSek,
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
      // Mark at the extended-hours print while one is running, so P&L, weights and the
      // stop/target rails all move together instead of freezing at the last close.
      const last = quoteMark(live.quotes[position.symbol]);
      if (last == null) return position;
      const pnlPct = position.fill
        ? Number((((last - position.fill) / position.fill) * 100 * (position.side === "short" ? -1 : 1)).toFixed(2))
        : 0;
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
  const fallbackDay = formatIsoDate(live.fetchedAt || new Date().toISOString(), timeZone);
  const next: Record<string, TradingCandle[]> = {};

  for (const [symbol, candles] of Object.entries(charts)) {
    const quote = live.quotes[symbol];
    // Daily candles carry the regular session only — the extended print rides on its own
    // price line, and the quote's own market date says which bar it belongs to. Stamping
    // the wall-clock day instead used to graft yesterday's close onto a fake bar at dawn.
    if (!quote?.last) {
      next[symbol] = candles;
      continue;
    }
    const day = quote.marketDate || fallbackDay;
    const high = Math.max(quote.dayHigh ?? quote.last, quote.last);
    const low = Math.min(quote.dayLow ?? quote.last, quote.last);
    const index = candles.findIndex((candle) => candle.time === day);

    if (index >= 0) {
      const candle = candles[index];
      next[symbol] = [
        ...candles.slice(0, index),
        {
          ...candle,
          close: quote.last,
          high: Math.max(candle.high, high),
          low: Math.min(candle.low, low),
        },
        ...candles.slice(index + 1),
      ];
      continue;
    }

    const last = candles.at(-1);
    if (last && last.time > day) {
      next[symbol] = candles;
      continue;
    }
    next[symbol] = [
      ...candles,
      { time: day, open: last?.close ?? quote.previousClose ?? quote.last, high, low, close: quote.last },
    ];
  }

  return next;
}

export function stampLiveEquity(points: TradingPoint[], book: TradingBook, quotes: Record<string, TradingQuote> = {}): TradingPoint[] {
  const stats = getTradingDeskStats(book, quotes);
  // On the exchange's calendar: at 18:00 in New York it is still today's trade, not tomorrow's.
  const today = formatIsoDate(book.updatedAt || new Date().toISOString(), TRADING_MARKET_TIMEZONE);
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

export function resolvePreviousClose(last: number, dayPct: number | null, previousClose: number | null) {
  if (dayPct != null && Number.isFinite(dayPct) && dayPct !== -100) {
    const implied = last / (1 + dayPct / 100);
    if (Number.isFinite(implied) && implied !== 0) return implied;
  }
  if (previousClose != null && Number.isFinite(previousClose) && previousClose !== 0) return previousClose;
  return null;
}

export function usSessionPhase(now = new Date()): TradingSession {
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
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const stamp = hour * 60 + minute;
  if (stamp >= 4 * 60 && stamp < 9 * 60 + 30) return "pre";
  if (stamp >= 9 * 60 + 30 && stamp < 16 * 60) return "open";
  if (stamp >= 16 * 60 && stamp < 20 * 60) return "post";
  return "closed";
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

export const EQUITY_RANGES = [
  { key: "1d", label: "Idag", days: 1 },
  { key: "1w", label: "1 Vecka", days: 7 },
  { key: "1m", label: "1 Månad", days: 31 },
  { key: "1y", label: "1 År", days: 365 },
  { key: "all", label: "Sedan Start", days: null },
] as const;

export type EquityRange = (typeof EQUITY_RANGES)[number]["key"];

export function sliceFrom(points: TradingPoint[], startTime?: string) {
  if (!startTime || points.length === 0) return points;
  const before = [...points].reverse().find((point) => point.time < startTime && point.value !== 0);
  const fromStart = points.filter((point) => point.time >= startTime);
  if (!fromStart.length) return before ? [before] : points;
  if (before && fromStart[0]?.time !== before.time) return [before, ...fromStart];
  return fromStart;
}

export function sliceByRange(points: TradingPoint[], range: EquityRange, firstFill?: string) {
  if (range === "all") return sliceFrom(points, firstFill);
  const last = points.at(-1)?.time;
  if (!last) return points;
  const days = EQUITY_RANGES.find((item) => item.key === range)?.days ?? 1;
  const end = Date.parse(`${last}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const startTime = start.toISOString().slice(0, 10);
  const floor = firstFill && firstFill > startTime ? firstFill : startTime;
  return sliceFrom(points, floor);
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

  // The live mark belongs to today's point, which stampLiveEquity adds or replaces —
  // overwriting the last close here would have flattened the day it closed on.
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
