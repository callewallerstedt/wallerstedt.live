import data from "./music-data.json";

/**
 * The streaming dataset, built from a Spotify-for-Artists scrape by
 * `npm run music:sync`. Days are a shared axis so a song is just an offset plus
 * a run of counts, which keeps 500 days of 24 songs down to a file the phone
 * can hold in memory without noticing.
 */
export type MusicSong = {
  id: string;
  name: string;
  category: "own" | "label";
  offset: number;
  values: number[];
};

/**
 * Two different things, kept apart because they are true at different times.
 * `account` is the DistroKid balance page, scraped whenever the scraper last
 * ran. `transactions` is the full sales export, which is authoritative for what
 * was earned but always trails: a sale month keeps filling in for about ten
 * weeks after it ends, so the newest months are flagged rather than trusted.
 */
export type MusicEarnings = {
  account: {
    scrapedAt: string;
    totalEarnedUsd: number | null;
    totalWithdrawnUsd: number | null;
    balanceUsd: number | null;
    withdrawals: Array<{ date: string; amountUsd: number }>;
  } | null;
  transactions: {
    source: string;
    exportedOn: string;
    from: string;
    to: string;
    /** The last sale month old enough to be finished reporting. */
    completeThrough: string | null;
    totalEarnedUsd: number;
    settledEarnedUsd: number;
    avgDelayDays: number | null;
    ratePerSpotifyStreamUsd: number | null;
    months: Array<{
      month: string;
      earnUsd: number;
      qty: number;
      partial: boolean;
      lagDays: number | null;
    }>;
    byMonthStore: Array<{ store: string; values: number[] }>;
    stores: Array<EarningsRow & { store: string; pps: number | null }>;
    countries: Array<EarningsRow & { code: string }>;
    titles: Array<EarningsRow & { title: string; category: Category | null }>;
  } | null;
};

type EarningsRow = {
  earnUsd: number;
  qty: number;
  /** Earned in the last three settled months, and how that compares to the three before. */
  recentUsd: number;
  growth: number | null;
};

export type MusicData = {
  version: number;
  source: string;
  scrapedAt: string | null;
  from: string;
  to: string;
  latestRow: string;
  days: string[];
  songs: MusicSong[];
  earnings: MusicEarnings | null;
};

export const musicData = data as MusicData;

export type Category = "own" | "label";

// ── Colour ────────────────────────────────────────────────────────────────────
/**
 * Own and label are the two series the page leans on, so they get fixed hues
 * that survive an accent change: identity must not move when the theme does.
 * Per-song lines draw the eight-slot categorical order in sequence, never
 * cycled — past eight the chart folds the tail into "Other".
 */
export const CATEGORY_COLOR: Record<Category, string> = {
  own: "var(--m-own)",
  label: "var(--m-label)",
};

export const SERIES_COLORS = [
  "var(--m-1)",
  "var(--m-2)",
  "var(--m-3)",
  "var(--m-4)",
  "var(--m-5)",
  "var(--m-6)",
  "var(--m-7)",
  "var(--m-8)",
];

export const MAX_SONG_SERIES = SERIES_COLORS.length;

export const OTHER_COLOR = "var(--m-other)";

// ── Dates ─────────────────────────────────────────────────────────────────────
export function shiftYmd(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoWeekStart(ymd: string) {
  const date = new Date(`${ymd}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

// ── Series maths ──────────────────────────────────────────────────────────────
/** A song's counts laid out on the shared day axis, zero where it had none. */
export function expand(song: MusicSong, length: number) {
  const out = new Array<number>(length).fill(0);
  for (let index = 0; index < song.values.length; index += 1) {
    const position = song.offset + index;
    if (position >= 0 && position < length) out[position] = song.values[index];
  }
  return out;
}

export function sumInto(target: number[], source: number[]) {
  for (let index = 0; index < target.length; index += 1) target[index] += source[index];
  return target;
}

export function total(values: number[], from = 0, to = values.length - 1) {
  let sum = 0;
  for (let index = Math.max(0, from); index <= Math.min(values.length - 1, to); index += 1) {
    sum += values[index];
  }
  return sum;
}

export function movingAverage(values: number[], window: number) {
  if (window <= 1) return values;
  const out = new Array<number>(values.length);
  let running = 0;
  for (let index = 0; index < values.length; index += 1) {
    running += values[index];
    if (index >= window) running -= values[index - window];
    const span = Math.min(index + 1, window);
    out[index] = running / span;
  }
  return out;
}

export type GroupBy = "day" | "week" | "month";

export type Grouped = {
  keys: string[];
  /** The first calendar day inside each bucket — what a tooltip should show. */
  starts: string[];
  ends: string[];
  buckets: number[][];
};

/** Bucket a slice of the day axis into days, ISO weeks or calendar months. */
export function groupDays(days: string[], groupBy: GroupBy): Grouped {
  if (groupBy === "day") {
    return {
      keys: days,
      starts: days,
      ends: days,
      buckets: days.map((_, index) => [index]),
    };
  }
  const keyOf = (day: string) => (groupBy === "week" ? isoWeekStart(day) : day.slice(0, 7));
  const keys: string[] = [];
  const buckets: number[][] = [];
  const starts: string[] = [];
  const ends: string[] = [];
  let current = "";
  days.forEach((day, index) => {
    const key = keyOf(day);
    if (key !== current) {
      current = key;
      keys.push(key);
      buckets.push([]);
      starts.push(day);
      ends.push(day);
    }
    buckets[buckets.length - 1].push(index);
    ends[ends.length - 1] = day;
  });
  return { keys, starts, ends, buckets };
}

export function applyGrouping(values: number[], grouped: Grouped) {
  return grouped.buckets.map((bucket) => bucket.reduce((sum, index) => sum + values[index], 0));
}

export function cumulate(values: number[]) {
  let running = 0;
  return values.map((value) => (running += value));
}

// ── Trend ─────────────────────────────────────────────────────────────────────
export function linearFit(values: number[]) {
  const n = values.length;
  if (n < 3) return { slope: 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  values.forEach((value, index) => {
    sx += index;
    sy += value;
    sxy += index * value;
    sxx += index * index;
  });
  const denominator = n * sxx - sx * sx;
  if (denominator === 0) return { slope: 0, r2: 0 };
  const slope = (n * sxy - sx * sy) / denominator;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  const ssTot = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const ssRes = values.reduce(
    (sum, value, index) => sum + (value - (slope * index + intercept)) ** 2,
    0,
  );
  return { slope, r2: ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0 };
}

export type SongStats = {
  id: string;
  name: string;
  category: Category;
  /** Streams inside the window on screen. */
  windowTotal: number;
  /** Streams over the whole scraped history — the number that never shrinks. */
  lifetime: number;
  avgDaily: number;
  last7avg: number;
  prev7avg: number;
  last30avg: number;
  prev30avg: number;
  weekGrowth: number | null;
  monthGrowth: number | null;
  trendSlope: number;
  trendR2: number;
  projected30: number;
  momentum: number;
  peak: number;
  peakDay: string | null;
  activeDays: number;
  spark: number[];
  firstDay: string | null;
  lastDay: string | null;
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * Growth, trend and a composite momentum score, measured backwards from the end
 * of whatever window is on screen — so narrowing the range re-reads the same
 * question at that point in time instead of freezing on today.
 */
export function computeStats(
  song: { id: string; name: string; category: Category },
  daily: number[],
  days: string[],
  from: number,
  to: number,
): SongStats {
  const windowValues = daily.slice(from, to + 1);
  const at = (offset: number) => daily.slice(Math.max(0, to + 1 - offset), Math.max(0, to + 1));
  const last7 = at(7);
  const prev7 = daily.slice(Math.max(0, to + 1 - 14), Math.max(0, to + 1 - 7));
  const last30 = at(30);
  const prev30 = daily.slice(Math.max(0, to + 1 - 60), Math.max(0, to + 1 - 30));
  const last90 = at(90);

  const last7avg = average(last7);
  const prev7avg = average(prev7);
  const last30avg = average(last30);
  const prev30avg = average(prev30);

  const weekGrowth = prev7avg > 0 ? ((last7avg - prev7avg) / prev7avg) * 100 : null;
  const monthGrowth = prev30avg > 0 ? ((last30avg - prev30avg) / prev30avg) * 100 : null;

  const fit = last90.length >= 7 ? linearFit(last90) : { slope: 0, r2: 0 };
  const projected30 = Math.max(0, last7avg + fit.slope * 15) * 30;

  let momentum = 0;
  if (weekGrowth !== null) momentum += weekGrowth * 0.45;
  if (monthGrowth !== null) momentum += monthGrowth * 0.35;
  if (last30avg > 0) momentum += (fit.slope / last30avg) * 100 * 20 * fit.r2;

  let peak = 0;
  let peakIndex = -1;
  let activeDays = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  windowValues.forEach((value, index) => {
    if (value > peak) {
      peak = value;
      peakIndex = index;
    }
    if (value > 0) {
      activeDays += 1;
      if (firstIndex < 0) firstIndex = index;
      lastIndex = index;
    }
  });

  const windowTotal = windowValues.reduce((sum, value) => sum + value, 0);

  return {
    id: song.id,
    name: song.name,
    category: song.category,
    windowTotal,
    lifetime: daily.reduce((sum, value) => sum + value, 0),
    avgDaily: activeDays ? windowTotal / activeDays : 0,
    last7avg,
    prev7avg,
    last30avg,
    prev30avg,
    weekGrowth,
    monthGrowth,
    trendSlope: fit.slope,
    trendR2: fit.r2,
    projected30,
    momentum,
    peak,
    peakDay: peakIndex >= 0 ? days[from + peakIndex] : null,
    activeDays,
    spark: last30,
    firstDay: firstIndex >= 0 ? days[from + firstIndex] : null,
    lastDay: lastIndex >= 0 ? days[from + lastIndex] : null,
  };
}

// ── Milestones ────────────────────────────────────────────────────────────────
export const MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000];

export function milestoneDays(daily: number[], days: string[]) {
  const hits: Record<number, string> = {};
  let running = 0;
  for (let index = 0; index < daily.length; index += 1) {
    running += daily[index];
    for (const milestone of MILESTONES) {
      if (!hits[milestone] && running >= milestone) hits[milestone] = days[index];
    }
  }
  return { hits, lifetime: running };
}

export function formatMilestone(value: number) {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
}

// ── Ranges ────────────────────────────────────────────────────────────────────
export const RANGES = [
  { key: "7", label: "7D", days: 7 },
  { key: "28", label: "28D", days: 28 },
  { key: "90", label: "90D", days: 90 },
  { key: "180", label: "6M", days: 180 },
  { key: "365", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"] | "custom";
