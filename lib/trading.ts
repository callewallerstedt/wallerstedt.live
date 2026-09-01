export const TRADING_BOOK_PATH = "/trading/book.json";
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
  chart: string;
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

export type TradingBook = {
  version: number;
  updatedAt: string;
  timezone: string;
  source?: string;
  experiment: {
    title: string;
    operator: string;
    style: string;
    capitalSek: number;
    rules: string[];
  };
  fxUsdSek: number;
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

export type TradingDeskStats = {
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

export function getTradingBookUrl() {
  return process.env.NEXT_PUBLIC_TRADING_BOOK_URL || TRADING_BOOK_PATH;
}

export function parseTradingBook(value: unknown): TradingBook {
  if (!isRecord(value)) {
    throw new Error("Trading book must be an object");
  }

  const experiment = isRecord(value.experiment) ? value.experiment : {};
  const stats = isRecord(value.stats) ? value.stats : {};

  return {
    version: asNumber(value.version, 1),
    updatedAt: asString(value.updatedAt),
    timezone: asString(value.timezone, TRADING_TIMEZONE),
    source: typeof value.source === "string" ? value.source : undefined,
    experiment: {
      title: asString(experiment.title, "Rayner live experiment"),
      operator: asString(experiment.operator, "Rayner"),
      style: asString(experiment.style, "long-only swing"),
      capitalSek: asNumber(experiment.capitalSek, 5000),
      rules: Array.isArray(experiment.rules) ? experiment.rules.map((rule) => String(rule)) : [],
    },
    fxUsdSek: asNumber(value.fxUsdSek, 9.61),
    positions: Array.isArray(value.positions) ? value.positions.map(parsePosition) : [],
    closed: Array.isArray(value.closed) ? value.closed.map(parseClosed) : [],
    stats: {
      openPnlSek: typeof stats.openPnlSek === "number" ? stats.openPnlSek : null,
      wins: typeof stats.wins === "number" ? stats.wins : null,
      losses: typeof stats.losses === "number" ? stats.losses : null,
    },
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
    chart: asString(row.chart, `/trading/charts/${asString(row.symbol).toUpperCase()}.json`),
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

export function positionPnlUsd(position: TradingPosition) {
  const delta = position.last - position.fill;
  return (position.side === "short" ? -delta : delta) * position.shares;
}

export function getTradingDeskStats(book: TradingBook): TradingDeskStats {
  const openPnlUsd = book.positions.reduce((sum, position) => sum + positionPnlUsd(position), 0);
  const notionalUsd = book.positions.reduce((sum, position) => sum + position.fill * position.shares, 0);
  const computedSek = openPnlUsd * book.fxUsdSek;

  return {
    openPnlSek: book.stats.openPnlSek ?? computedSek,
    openPnlUsd,
    notionalUsd,
    notionalSek: notionalUsd * book.fxUsdSek,
    namesHeld: book.positions.map((position) => position.symbol),
    wins: book.stats.wins,
    losses: book.stats.losses,
  };
}

export function formatSignedPct(value: number, digits = 1) {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
}

export function formatSignedNumber(value: number, digits = 0, suffix = "") {
  const abs = Math.abs(value).toLocaleString("en-GB", {
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
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatBerlinClock(iso: string, timeZone = TRADING_TIMEZONE) {
  return new Intl.DateTimeFormat("en-GB", {
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
