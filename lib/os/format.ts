import { COMPANY } from "./company";

export function berlinYmd(value: Date | string = new Date(), timeZone = COMPANY.timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function monthKey(ymd: string | null | undefined) {
  return ymd && /^\d{4}-\d{2}/.test(ymd) ? ymd.slice(0, 7) : null;
}

export function yearKey(ymd: string | null | undefined) {
  return ymd && /^\d{4}/.test(ymd) ? ymd.slice(0, 4) : null;
}

export function parseCatalogDate(value: string, timeZone = COMPANY.timeZone) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return berlinYmd(new Date(parsed), timeZone);
}

export function formatSek(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat(COMPANY.locale, {
    style: "currency",
    currency: COMPANY.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatSekCompact(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const abs = Math.abs(cents);
  if (abs >= 100_000_00) {
    return new Intl.NumberFormat(COMPANY.locale, {
      style: "currency",
      currency: COMPANY.currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }
  return formatSek(cents);
}

export function formatSekTile(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat(COMPANY.locale, {
    style: "currency",
    currency: COMPANY.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatSekDelta(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const formatted = formatSekTile(Math.abs(cents));
  if (cents > 0) return `+${formatted}`;
  if (cents < 0) return `−${formatted}`;
  return formatted;
}

export function formatVsLast(current: number, previous: number, lastMonthKey: string) {
  return `${formatSekDelta(current - previous)} vs ${formatMonthLabel(lastMonthKey)}`;
}

export function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(COMPANY.locale).format(value);
}

export function formatPercent(ratio: number | null | undefined) {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return new Intl.NumberFormat(COMPANY.locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}

export function formatDate(ymd: string | null | undefined) {
  if (!ymd) return "—";
  const date = new Date(`${ymd}T12:00:00+02:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return new Intl.DateTimeFormat(COMPANY.locale, {
    timeZone: COMPANY.timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatMonthLabel(key: string) {
  const date = new Date(`${key}-01T12:00:00+02:00`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(COMPANY.locale, {
    timeZone: COMPANY.timeZone,
    month: "short",
    year: "2-digit",
  }).format(date);
}

export function moneyToCents(value: number | string | { toString(): string } | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function formatCompactCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(COMPANY.locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatUsd(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(COMPANY.locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function monthEndYmd(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function lastNMonths(nowYmd: string, count: number) {
  const [year, month] = nowYmd.split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T12:00:00+02:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return berlinYmd(date);
}

export function daysUntil(fromYmd: string, toYmd: string) {
  const from = Date.parse(`${fromYmd}T12:00:00+02:00`);
  const to = Date.parse(`${toYmd}T12:00:00+02:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}
