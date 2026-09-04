#!/usr/bin/env node
/**
 * Fold a Spotify-for-Artists scrape into lib/os/music-data.json.
 *
 *   npm run music:sync                      # reads the default scraper folder
 *   npm run music:sync -- "D:/some/export"  # or any folder holding the JSON
 *   npm run music:sync -- ./scraped_data.json
 *   npm run music:sync -- . ~/Downloads/results.csv   # explicit DistroKid export
 *
 * The rebuild is additive: every day the dashboard already knows about is kept,
 * and the new scrape only overwrites the days it actually covers. So an export
 * that starts later than the first one extends the history instead of truncating
 * it, and a song that disappears from the scrape keeps the streams it earned.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
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

/**
 * The DistroKid "all transactions" export. It is the only honest source for
 * earnings: the account page only carries running totals, and a downloaded
 * export usually lands in Downloads before it is filed with the scraper.
 */
function findTransactions() {
  const explicit = process.argv[3] ?? process.env.MUSIC_CSV;
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) {
      console.error(`No transactions CSV at ${path}`);
      process.exit(1);
    }
    return path;
  }
  const candidates = [join(sourceDir, "results.csv"), join(homedir(), "Downloads", "results.csv")]
    .filter((path) => existsSync(path))
    .map((path) => ({ path, at: statSync(path).mtimeMs }));
  candidates.sort((a, b) => b.at - a.at);
  return candidates[0]?.path ?? null;
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

// -- Earnings, rebuilt from the DistroKid transactions export ----------------

/** One CSV line, honouring quotes and doubled quotes inside them. */
function splitCsvLine(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      out.push(field);
      field = "";
    } else field += char;
  }
  out.push(field);
  return out;
}

function readTransactions(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0]).map((name) => name.trim());
  const at = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`${basename(path)} has no "${name}" column`);
    return index;
  };
  const columns = {
    inserted: at("Date Inserted"),
    month: at("Sale Month"),
    store: at("Store"),
    title: at("Title"),
    quantity: at("Quantity"),
    country: at("Country of Sale"),
    earn: at("Earnings (USD)"),
  };
  const rows = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    const cells = splitCsvLine(lines[index]);
    const month = cells[columns.month];
    if (!month) continue;
    rows.push({
      inserted: cells[columns.inserted],
      month,
      store: cells[columns.store] || "Unknown",
      title: cells[columns.title] || "Unknown",
      country: cells[columns.country] || "??",
      quantity: Number(cells[columns.quantity]) || 0,
      earn: Number(cells[columns.earn]) || 0,
    });
  }
  return rows;
}

function monthEnd(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(index === 12 ? year + 1 : year, index % 12, 1));
}

const daysBetween = (from, to) => Math.round((to - from) / 86_400_000);

/**
 * DistroKid reports a sale month over the following two months or so: by day 58
 * about three quarters of it has landed, and it is settled by day 75. A month
 * younger than that is real but incomplete, and saying so is the difference
 * between "sales fell" and "the post has not arrived".
 */
const SETTLED_AFTER_DAYS = 75;

const NAME_KEY = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, "");

function buildTransactionEarnings(rows) {
  const exported = rows.reduce((max, row) => (row.inserted > max ? row.inserted : max), "");
  const exportedAt = new Date(`${exported}T00:00:00Z`);
  const categoryOf = new Map(packed.map((song) => [NAME_KEY(song.name), song.category]));

  const sum = (map, key, row) => {
    const entry = map.get(key) ?? { earn: 0, qty: 0 };
    entry.earn += row.earn;
    entry.qty += row.quantity;
    map.set(key, entry);
  };

  const byMonth = new Map();
  const byStore = new Map();
  const byCountry = new Map();
  const byTitle = new Map();
  const monthStore = new Map();
  const lag = new Map();

  for (const row of rows) {
    sum(byMonth, row.month, row);
    sum(byStore, row.store, row);
    sum(byCountry, row.country, row);
    sum(byTitle, row.title, row);
    sum(monthStore, `${row.month}\u0000${row.store}`, row);
    const seen = lag.get(row.month) ?? { weighted: 0, earn: 0 };
    seen.weighted += daysBetween(monthEnd(row.month), new Date(`${row.inserted}T00:00:00Z`)) * row.earn;
    seen.earn += row.earn;
    lag.set(row.month, seen);
  }

  const monthKeys = [...byMonth.keys()].sort();
  const settled = (month) => daysBetween(monthEnd(month), exportedAt) >= SETTLED_AFTER_DAYS;
  const completeThrough = [...monthKeys].reverse().find(settled) ?? null;

  const months = monthKeys.map((month) => ({
    month,
    earnUsd: round(byMonth.get(month).earn),
    qty: byMonth.get(month).qty,
    partial: !settled(month),
    lagDays: lag.get(month).earn > 0 ? Math.round(lag.get(month).weighted / lag.get(month).earn) : null,
  }));

  const rank = (map) => [...map].sort((a, b) => b[1].earn - a[1].earn);
  const complete = months.filter((row) => !row.partial);
  const window = (count) => complete.slice(-count).map((row) => row.month);
  const recent = new Set(window(3));
  const previous3 = new Set(complete.slice(-6, -3).map((row) => row.month));

  /** Earnings in the last three settled months against the three before them. */
  const trendFor = (keyOf) => {
    const now = new Map();
    const then = new Map();
    for (const row of rows) {
      if (recent.has(row.month)) now.set(keyOf(row), (now.get(keyOf(row)) ?? 0) + row.earn);
      else if (previous3.has(row.month)) then.set(keyOf(row), (then.get(keyOf(row)) ?? 0) + row.earn);
    }
    return (key) => {
      const before = then.get(key) ?? 0;
      const after = now.get(key) ?? 0;
      return {
        recentUsd: round(after),
        growth: before > 0 ? round(((after - before) / before) * 100, 1) : null,
      };
    };
  };
  const storeTrend = trendFor((row) => row.store);
  const countryTrend = trendFor((row) => row.country);
  const titleTrend = trendFor((row) => row.title);

  const leadStores = rank(byStore).slice(0, 6).map(([store]) => store);
  const leadSet = new Set(leadStores);
  const byMonthStore = leadStores.concat("Other").map((store) => ({
    store,
    values: monthKeys.map((month) => {
      if (store !== "Other") return round(monthStore.get(`${month}\u0000${store}`)?.earn ?? 0);
      let rest = 0;
      for (const [key, entry] of monthStore) {
        const [rowMonth, rowStore] = key.split("\u0000");
        if (rowMonth === month && !leadSet.has(rowStore)) rest += entry.earn;
      }
      return round(rest);
    }),
  }));

  const spotify = byStore.get("Spotify") ?? null;
  // Rate is read off settled months only, so a half-reported month cannot drag it.
  let settledEarn = 0;
  let settledSpotifyQty = 0;
  for (const row of rows) {
    if (completeThrough && row.month > completeThrough) continue;
    settledEarn += row.earn;
    if (row.store === "Spotify") settledSpotifyQty += row.quantity;
  }

  return {
    source: basename(txPath),
    exportedOn: exported,
    from: monthKeys[0],
    to: monthKeys.at(-1),
    completeThrough,
    totalEarnedUsd: round(rows.reduce((total, row) => total + row.earn, 0)),
    settledEarnedUsd: round(settledEarn),
    avgDelayDays:
      complete.length && complete.at(-1).lagDays != null
        ? Math.round(
            complete.slice(-6).reduce((total, row) => total + (row.lagDays ?? 0), 0) /
              complete.slice(-6).length,
          )
        : null,
    ratePerSpotifyStreamUsd: settledSpotifyQty ? round(settledEarn / settledSpotifyQty, 6) : null,
    months,
    byMonthStore,
    stores: rank(byStore).map(([store, entry]) => ({
      store,
      earnUsd: round(entry.earn),
      qty: entry.qty,
      pps: entry.qty ? round(entry.earn / entry.qty, 6) : null,
      ...storeTrend(store),
    })),
    countries: rank(byCountry)
      .slice(0, 15)
      .map(([code, entry]) => ({
        code,
        earnUsd: round(entry.earn),
        qty: entry.qty,
        ...countryTrend(code),
      })),
    titles: rank(byTitle).map(([title, entry]) => ({
      title,
      earnUsd: round(entry.earn),
      qty: entry.qty,
      category: categoryOf.get(NAME_KEY(title)) ?? null,
      ...titleTrend(title),
    })),
  };
}

function buildEarnings() {
  const account = earningsRaw
    ? {
        scrapedAt: toYmd(String(earningsRaw.scraped_at).slice(0, 10)),
        totalEarnedUsd: earningsRaw.total_earned_usd ?? null,
        totalWithdrawnUsd: earningsRaw.total_withdrawn_usd ?? null,
        balanceUsd: earningsRaw.balance_usd ?? null,
        withdrawals: (earningsRaw.withdrawals ?? [])
          .map((row) => ({ date: toYmd(row.date), amountUsd: round(Number(row.amount_usd) || 0) }))
          .sort((a, b) => (a.date < b.date ? 1 : -1)),
      }
    : (previous?.earnings?.account ?? null);

  let transactions = previous?.earnings?.transactions ?? null;
  if (txPath) {
    const next = buildTransactionEarnings(readTransactions(txPath));
    // An older export must never walk the numbers backwards.
    if (!transactions || next.exportedOn >= transactions.exportedOn) transactions = next;
    else {
      console.log(
        `(kept the stored export from ${transactions.exportedOn}; ${basename(txPath)} only runs to ${next.exportedOn})`,
      );
    }
  }

  if (!account && !transactions) return null;
  return { account, transactions };
}

const txPath = findTransactions();

const payload = {
  version: 2,
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
const tx = payload.earnings?.transactions;
if (tx) {
  console.log(
    `earnings from ${tx.source} exported ${tx.exportedOn} - sale months ${tx.from} to ${tx.to}, ` +
      `settled through ${tx.completeThrough}, $${tx.totalEarnedUsd.toLocaleString("en-US")} all time`,
  );
} else {
  console.log("(no DistroKid results.csv found - earnings left as they were)");
}
