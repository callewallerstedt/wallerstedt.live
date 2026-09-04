#!/usr/bin/env node
/**
 * Fold a Spotify-for-Artists scrape into lib/os/music-data.json.
 *
 *   npm run music:sync                      # reads the default scraper folder
 *   npm run music:sync -- "D:/some/export"  # or any folder holding the JSON
 *   npm run music:sync -- ./scraped_data.json
 *
 * The rebuild is additive: every day the dashboard already knows about is kept,
 * and the new scrape only overwrites the days it actually covers. So an export
 * that starts later than the first one extends the history instead of truncating
 * it, and a song that disappears from the scrape keeps the streams it earned.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const DEFAULT_SOURCE = "C:/Claude Code/Spotify scraper Analytics";
const DEST = resolve(process.cwd(), "lib/os/music-data.json");

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Apr 14, 2025" and "2025-04-14" both land on "2025-04-14". */
function toYmd(value) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!match) throw new Error(`Cannot read date: ${value}`);
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) throw new Error(`Cannot read month: ${value}`);
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function shiftYmd(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eachDay(fromYmd, throughYmd) {
  const out = [];
  for (let day = fromYmd; day <= throughYmd; day = shiftYmd(day, 1)) out.push(day);
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function maybeRead(path) {
  return existsSync(path) ? readJson(path) : null;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// -- Source layout -----------------------------------------------------------
const argument = process.argv[2] ?? process.env.MUSIC_SOURCE ?? DEFAULT_SOURCE;
const argPath = resolve(argument);
const pointsAtFile = existsSync(argPath) && statSync(argPath).isFile();
const sourceDir = pointsAtFile ? resolve(argPath, "..") : argPath;
const scrapePath = pointsAtFile ? argPath : join(sourceDir, "scraped_data.json");

if (!existsSync(scrapePath)) {
  console.error(`No scraped_data.json at ${scrapePath}`);
  console.error('Pass the scraper folder: npm run music:sync -- "C:/path/to/folder"');
  process.exit(1);
}

const scrape = readJson(scrapePath);
const categories = maybeRead(join(sourceDir, "categories.json")) ?? {};
const earningsRaw = maybeRead(join(sourceDir, "earnings_data.json"));
const revenueRaw = maybeRead(join(sourceDir, "revenue_summary.json"));
const previous = maybeRead(DEST);

// -- Merge the scrape into whatever history already exists -------------------
/** @type {Map<string, {id: string, name: string, category: string, byDay: Map<string, number>}>} */
const songs = new Map();

function slot(id) {
  let entry = songs.get(id);
  if (!entry) {
    entry = { id, name: id, category: "own", byDay: new Map() };
    songs.set(id, entry);
  }
  return entry;
}

for (const song of previous?.songs ?? []) {
  const entry = slot(song.id);
  entry.name = song.name;
  entry.category = song.category;
  const knownDays = previous.days ?? [];
  song.values.forEach((value, position) => {
    const day = knownDays[song.offset + position];
    if (day) entry.byDay.set(day, value);
  });
}

let scrapedAt = previous?.scrapedAt ?? null;

for (const [id, song] of Object.entries(scrape)) {
  const entry = slot(id);
  entry.name = song.name ?? entry.name;
  entry.category = categories[id] ?? song.category ?? entry.category;
  if (song.scraped_at) {
    const stamp = toYmd(String(song.scraped_at).slice(0, 10));
    if (!scrapedAt || stamp > scrapedAt) scrapedAt = stamp;
  }
  for (const point of song.data ?? []) {
    entry.byDay.set(toYmd(point.date), Number(point.streams) || 0);
  }
}

// Categories can be re-tagged without a fresh scrape.
for (const [id, category] of Object.entries(categories)) {
  if (songs.has(id)) songs.get(id).category = category;
}

// -- Trim to the window the data can actually answer for ---------------------
const nonZeroDays = (entry) =>
  [...entry.byDay]
    .filter(([, value]) => value > 0)
    .map(([day]) => day)
    .sort();

const live = [];
for (const entry of songs.values()) {
  const observed = nonZeroDays(entry);
  if (!observed.length) continue;
  live.push({ entry, first: observed[0], last: observed[observed.length - 1] });
}
if (!live.length) {
  console.error("The scrape holds no non-zero days.");
  process.exit(1);
}

const globalFirst = live.reduce((min, row) => (row.first < min ? row.first : min), live[0].first);
const globalLast = live.reduce((max, row) => (row.last > max ? row.last : max), live[0].last);

/**
 * The scraper writes today's row before Spotify has finished counting it, and a
 * song that stopped being scraped freezes on its last day. Both would read as a
 * cliff in the totals, so the axis stops at the last day every *currently
 * streaming* song has a row for.
 */
const recentCutoff = shiftYmd(globalLast, -30);
const activeEnds = live
  .filter((row) => row.last >= recentCutoff)
  .map((row) => [...row.entry.byDay.keys()].sort().at(-1));
const lastComplete = activeEnds.length
  ? activeEnds.reduce((min, day) => (day < min ? day : min))
  : globalLast;
const through = [...songs.values()]
  .flatMap((entry) =>
    [...entry.byDay].filter(([day, value]) => value > 0 && day <= lastComplete).map(([day]) => day),
  )
  .reduce((max, day) => (day > max ? day : max), globalFirst);

const days = eachDay(globalFirst, through);
const index = new Map(days.map((day, position) => [day, position]));

const packed = [];
for (const entry of songs.values()) {
  const observed = [...entry.byDay]
    .filter(([day]) => index.has(day))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const withStreams = observed.filter(([, value]) => value > 0);
  if (!withStreams.length) continue;
  const offset = index.get(withStreams[0][0]);
  const end = index.get(withStreams[withStreams.length - 1][0]);
  const values = new Array(end - offset + 1).fill(0);
  for (const [day, value] of observed) {
    const position = index.get(day) - offset;
    if (position >= 0 && position < values.length) values[position] = value;
  }
  packed.push({
    id: entry.id,
    name: entry.name,
    category: entry.category === "label" ? "label" : "own",
    offset,
    values,
  });
}

const totalOf = (song) => song.values.reduce((sum, value) => sum + value, 0);
packed.sort((a, b) => totalOf(b) - totalOf(a));

// -- Earnings, kept as a compact companion -----------------------------------
function buildEarnings() {
  if (!earningsRaw && !revenueRaw) return previous?.earnings ?? null;

  const byTitle = new Map();
  for (const row of earningsRaw?.earnings ?? []) {
    const title = row.title ?? "Unknown";
    byTitle.set(title, round((byTitle.get(title) ?? 0) + (Number(row.amount_usd) || 0)));
  }
  const byStore = new Map();
  for (const row of earningsRaw?.services ?? []) {
    const store = row.store ?? "Unknown";
    byStore.set(store, round((byStore.get(store) ?? 0) + (Number(row.amount_usd) || 0)));
  }
  const stores = revenueRaw?.stores ?? {};
  const storeRows = [...byStore]
    .map(([store, earnUsd]) => ({
      store,
      earnUsd,
      qty: stores[store]?.qty ?? null,
      pps: stores[store]?.pps ?? null,
    }))
    .sort((a, b) => b.earnUsd - a.earnUsd);

  const months = Object.entries(revenueRaw?.monthly_earnings ?? {})
    .map(([month, row]) => ({
      month,
      own: round(row.own ?? 0),
      label: round(row.label ?? 0),
      total: round(row.total ?? 0),
    }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  const withdrawals = (earningsRaw?.withdrawals ?? [])
    .map((row) => ({ date: toYmd(row.date), amountUsd: round(Number(row.amount_usd) || 0) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    scrapedAt: earningsRaw?.scraped_at ? toYmd(String(earningsRaw.scraped_at).slice(0, 10)) : null,
    generated: revenueRaw?.generated ?? null,
    totalEarnedUsd: earningsRaw?.total_earned_usd ?? null,
    totalWithdrawnUsd: earningsRaw?.total_withdrawn_usd ?? null,
    balanceUsd: earningsRaw?.balance_usd ?? null,
    ratePerStreamUsd: revenueRaw?.effective_rate_per_spotify_stream ?? null,
    avgDelayDays: revenueRaw?.weighted_avg_delay_days ?? null,
    spotify: stores.Spotify
      ? { qty: stores.Spotify.qty, earnUsd: round(stores.Spotify.earn), pps: stores.Spotify.pps }
      : null,
    stores: storeRows,
    titles: [...byTitle]
      .map(([title, earnUsd]) => ({ title, earnUsd }))
      .sort((a, b) => b.earnUsd - a.earnUsd),
    months,
    withdrawals,
  };
}

const payload = {
  version: 1,
  source: basename(sourceDir),
  scrapedAt,
  from: days[0],
  to: days[days.length - 1],
  latestRow: globalLast,
  days,
  songs: packed,
  earnings: buildEarnings(),
};

writeFileSync(DEST, `${JSON.stringify(payload)}\n`);

const grand = packed.reduce((sum, song) => sum + totalOf(song), 0);
const bytes = statSync(DEST).size;
console.log(
  `wrote lib/os/music-data.json - ${packed.length} songs, ${days.length} days, ` +
    `${days[0]} to ${days[days.length - 1]}, ${grand.toLocaleString("en-US")} streams, ` +
    `${(bytes / 1024).toFixed(0)} KB`,
);
if (globalLast > payload.to) {
  console.log(`(rows up to ${globalLast} held back - not every active song has reported that far)`);
}
