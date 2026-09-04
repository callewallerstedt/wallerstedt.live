import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGrouping,
  computeStats,
  cumulate,
  expand,
  groupDays,
  isoWeekStart,
  linearFit,
  milestoneDays,
  movingAverage,
  musicData,
  shiftYmd,
} from "./music";

test("the dataset is a scrape, laid out on one shared day axis", () => {
  assert.equal(musicData.version, 2);
  assert.ok(musicData.days.length > 300, "expected at least a year of days");
  assert.equal(musicData.from, musicData.days[0]);
  assert.equal(musicData.to, musicData.days.at(-1));
  assert.ok(musicData.songs.length > 0);

  // The axis is every calendar day between the ends, with no gaps.
  for (let index = 1; index < musicData.days.length; index += 1) {
    assert.equal(musicData.days[index], shiftYmd(musicData.days[index - 1], 1));
  }

  for (const song of musicData.songs) {
    assert.ok(["own", "label"].includes(song.category), `${song.name} has no category`);
    assert.ok(song.offset >= 0);
    assert.ok(song.offset + song.values.length <= musicData.days.length, `${song.name} runs off the axis`);
    assert.ok(song.values.every((value) => Number.isFinite(value) && value >= 0));
    // Runs are trimmed to the days the song actually had plays on.
    assert.ok(song.values[0] > 0, `${song.name} starts on a zero`);
    assert.ok(song.values.at(-1)! > 0, `${song.name} ends on a zero`);
  }
});

test("both categories carry streams, so the split is real", () => {
  const totalFor = (category: string) =>
    musicData.songs
      .filter((song) => song.category === category)
      .reduce((sum, song) => sum + song.values.reduce((a, b) => a + b, 0), 0);
  assert.ok(totalFor("own") > 0);
  assert.ok(totalFor("label") > 0);
});

test("expand puts a song back on the axis without moving its total", () => {
  const song = musicData.songs[0];
  const values = expand(song, musicData.days.length);
  assert.equal(values.length, musicData.days.length);
  assert.equal(
    values.reduce((a, b) => a + b, 0),
    song.values.reduce((a, b) => a + b, 0),
  );
  assert.equal(values[song.offset], song.values[0]);
});

test("grouping keeps the sum and orders the buckets", () => {
  const days = ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02", "2026-02-03"];
  const values = [1, 2, 3, 4, 5];

  const byDay = applyGrouping(values, groupDays(days, "day"));
  assert.deepEqual(byDay, values);

  const months = groupDays(days, "month");
  assert.deepEqual(months.keys, ["2026-01", "2026-02"]);
  assert.deepEqual(months.starts, ["2026-01-30", "2026-02-01"]);
  assert.deepEqual(months.ends, ["2026-01-31", "2026-02-03"]);
  assert.deepEqual(applyGrouping(values, months), [3, 12]);

  const weeks = groupDays(days, "week");
  assert.deepEqual(weeks.keys, ["2026-01-26", "2026-02-02"]);
  assert.equal(
    applyGrouping(values, weeks).reduce((a, b) => a + b, 0),
    15,
  );
});

test("iso weeks start on Monday", () => {
  assert.equal(isoWeekStart("2026-09-02"), "2026-08-31");
  assert.equal(isoWeekStart("2026-08-31"), "2026-08-31");
  assert.equal(isoWeekStart("2026-09-06"), "2026-08-31");
});

test("moving average is trailing and leaves short windows alone", () => {
  assert.deepEqual(movingAverage([1, 2, 3], 1), [1, 2, 3]);
  assert.deepEqual(movingAverage([2, 4, 6, 8], 2), [2, 3, 5, 7]);
});

test("cumulate ends on the total", () => {
  assert.deepEqual(cumulate([1, 2, 3]), [1, 3, 6]);
});

test("a straight line fits exactly", () => {
  const fit = linearFit([0, 2, 4, 6, 8]);
  assert.equal(Math.round(fit.slope * 1000) / 1000, 2);
  assert.equal(Math.round(fit.r2), 1);
});

test("growth compares the last seven days against the seven before", () => {
  const days = Array.from({ length: 14 }, (_, index) => shiftYmd("2026-01-01", index));
  const values = [...new Array(7).fill(100), ...new Array(7).fill(200)];
  const stats = computeStats(
    { id: "x", name: "X", category: "own" },
    values,
    days,
    0,
    values.length - 1,
  );
  assert.equal(stats.last7avg, 200);
  assert.equal(stats.prev7avg, 100);
  assert.equal(stats.weekGrowth, 100);
  assert.equal(stats.windowTotal, 2100);
  assert.equal(stats.peak, 200);
  assert.equal(stats.activeDays, 14);
});

test("a milestone is dated by the day the running total crossed it", () => {
  const days = ["2026-01-01", "2026-01-02", "2026-01-03"];
  const { hits, lifetime } = milestoneDays([6000, 5000, 1000], days);
  assert.equal(lifetime, 12000);
  assert.equal(hits[10_000], "2026-01-02");
  assert.equal(hits[50_000], undefined);
});

test("earnings come from the transactions export, with the tail flagged", () => {
  const earnings = musicData.earnings;
  assert.ok(earnings, "expected an earnings block");
  const tx = earnings.transactions;
  assert.ok(tx, "expected the DistroKid transactions export");

  assert.match(tx.exportedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(tx.from < tx.to);
  assert.ok(tx.totalEarnedUsd > 0);
  assert.ok(tx.settledEarnedUsd <= tx.totalEarnedUsd);

  // Months run forward, and once a month is settled every later one stays settled
  // or is flagged partial - "partial" is only ever a suffix of the series.
  const months = tx.months.map((row) => row.month);
  assert.deepEqual(months, [...months].sort());
  const firstPartial = tx.months.findIndex((row) => row.partial);
  if (firstPartial >= 0) {
    assert.ok(tx.months.slice(firstPartial).every((row) => row.partial));
    assert.equal(tx.completeThrough, tx.months[firstPartial - 1]?.month ?? null);
  }

  // Every dollar in the stacked store series is a dollar in the monthly totals.
  const stacked = tx.byMonthStore.reduce(
    (sum, row) => sum + row.values.reduce((a, b) => a + b, 0),
    0,
  );
  assert.ok(Math.abs(stacked - tx.totalEarnedUsd) < 1);
  for (const row of tx.byMonthStore) assert.equal(row.values.length, tx.months.length);

  // Ranked lists are ranked, and a title tagged with a category matches a song.
  const ranked = (rows: Array<{ earnUsd: number }>) =>
    rows.every((row, index) => index === 0 || rows[index - 1].earnUsd >= row.earnUsd);
  assert.ok(ranked(tx.stores));
  assert.ok(ranked(tx.countries));
  assert.ok(ranked(tx.titles));
  const names = new Set(musicData.songs.map((song) => song.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
  for (const row of tx.titles) {
    if (!row.category) continue;
    assert.ok(names.has(row.title.toLowerCase().replace(/[^a-z0-9]/g, "")), `${row.title} has no song`);
  }
});
