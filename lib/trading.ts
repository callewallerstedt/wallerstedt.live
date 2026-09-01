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

export type TradingDeskStats = {
  equitySek: number;
  openPnlSek: number;
  openPnlUsd: number;
  notionalUsd: number;
  notionalSek: number;
  namesHeld: string[];
  wins: number | null;
  losses: number | null;
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

export function getTradingDeskStats(book: TradingBook): TradingDeskStats {
  const openPnlUsd = book.positions.reduce((sum, position) => sum + positionPnlUsd(position), 0);
  const notionalUsd = book.positions.reduce((sum, position) => sum + position.fill * position.shares, 0);
  const computedSek = openPnlUsd * book.fxUsdSek;
  const openPnlSek = book.stats.openPnlSek ?? computedSek;

  return {
    equitySek: book.experiment.capitalSek + openPnlSek,
    openPnlSek,
    openPnlUsd,
    notionalUsd,
    notionalSek: notionalUsd * book.fxUsdSek,
    namesHeld: book.positions.map((position) => position.symbol),
    wins: book.stats.wins,
    losses: book.stats.losses,
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
