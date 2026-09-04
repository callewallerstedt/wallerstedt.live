"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChartAreaIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChevronRightIcon,
  Columns3Icon,
  ListIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";

import {
  CATEGORY_COLOR,
  MAX_SONG_SERIES,
  MILESTONES,
  OTHER_COLOR,
  RANGES,
  SERIES_COLORS,
  applyGrouping,
  computeStats,
  cumulate,
  expand,
  formatMilestone,
  groupDays,
  milestoneDays,
  movingAverage,
  musicData,
  type Category,
  type GroupBy,
  type RangeKey,
  type SongStats,
} from "@/lib/os/music";
import {
  MiniSpark,
  MusicChart,
  RangeBrush,
  RankedBars,
  briefNumber,
  useStickyState,
  type ChartSeries,
} from "@/components/os/music-chart";
import { EmptyState, KpiCard, KpiGrid, Panel, Pill, Row, SectionLabel } from "@/components/os/ui";
import type { ReleaseRow, SourceState } from "@/lib/os/types";
import { zIndex } from "@/lib/z-index";
import { cn } from "@/lib/utils";

const DAYS = musicData.days;
const LENGTH = DAYS.length;

const numberFormat = new Intl.NumberFormat("en-GB");
const usdFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

const count = (value: number) => numberFormat.format(Math.round(value));
const brief = (value: number) => briefNumber(Math.round(value));
const usd = (value: number) => usdFormat.format(value);

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fullFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

function asDate(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`);
}
const shortDay = (ymd: string) => dayFormat.format(asDate(ymd));
const fullDay = (ymd: string) => (ymd ? fullFormat.format(asDate(ymd)) : "—");
const shortMonth = (key: string) => monthFormat.format(asDate(`${key}-01`));

function growthLabel(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${value > 0 ? "+" : ""}${rounded}%`;
}

function growthTone(value: number | null) {
  if (value == null) return "text-muted-foreground";
  if (value > 2) return "text-positive";
  if (value < -2) return "text-destructive";
  return "text-muted-foreground";
}

// ── Small building blocks ─────────────────────────────────────────────────────
function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      role="group"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-2 py-1 text-[0.7rem] font-semibold whitespace-nowrap text-muted-foreground",
            value === option.value && "bg-card text-foreground shadow-sm",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

function StatTile({
  label,
  value,
  hint,
  delta,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  color?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-card px-2.5 py-2 ring-1 ring-foreground/10">
      <p className="flex items-center gap-1.5 text-[0.7rem] leading-tight font-medium text-muted-foreground">
        {color ? <Swatch color={color} /> : null}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 text-xl leading-tight font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5 text-[0.68rem] leading-tight">
        {delta != null ? (
          <span className={cn("font-semibold tabular-nums", growthTone(delta))}>
            {growthLabel(delta)}
          </span>
        ) : null}
        {hint ? <span className="truncate text-muted-foreground">{hint}</span> : null}
      </p>
    </div>
  );
}

function InsightCard({
  title,
  main,
  detail,
  chip,
  tone,
}: {
  title: string;
  main: string;
  detail: string;
  chip?: string;
  tone: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex w-[15rem] shrink-0 snap-start flex-col rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10 sm:w-auto">
      <p className="text-[0.68rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {title}
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{main}</p>
        {chip ? (
          <span
            className={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              tone === "positive" && "text-positive",
              tone === "negative" && "text-destructive",
              tone === "neutral" && "text-muted-foreground",
            )}
          >
            {chip}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}

// ── The page ──────────────────────────────────────────────────────────────────
type SortKey = "momentum" | "week" | "month" | "recent" | "total" | "trend";

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "momentum", label: "Momentum" },
  { value: "week", label: "7d growth" },
  { value: "month", label: "30d growth" },
  { value: "recent", label: "Per day" },
  { value: "total", label: "Streams" },
  { value: "trend", label: "Trend" },
];

export function MusicDashboard({
  releases,
  followers,
  sources,
  todayYmd,
}: {
  releases: ReleaseRow[];
  followers: number | null;
  sources: SourceState[];
  todayYmd: string;
}) {
  const [overrides, setOverrides] = useStickyState<Record<string, Category>>("os-music-categories", {});
  const [hidden, setHidden] = useStickyState<string[]>("os-music-hidden", []);
  const [halfLabel, setHalfLabel] = useStickyState("os-music-half-label", false);
  const [rangeKey, setRangeKey] = useStickyState<RangeKey>("os-music-range", "365");
  const [groupBy, setGroupBy] = useStickyState<GroupBy>("os-music-group", "day");
  const [smooth, setSmooth] = useStickyState<number>("os-music-smooth", 7);
  const [chartType, setChartType] = useStickyState<"line" | "area" | "bar">("os-music-type", "area");
  const [metric, setMetric] = useStickyState<"daily" | "cumulative" | "share">("os-music-metric", "daily");
  const [view, setView] = useStickyState<"split" | "songs">("os-music-view", "split");
  const [sortKey, setSortKey] = useStickyState<SortKey>("os-music-sort", "momentum");
  const [catalogView, setCatalogView] = useState<"list" | "table">("list");

  const [customSpan, setCustomSpan] = useStickyState("os-music-span", {
    from: Math.max(0, LENGTH - 90),
    to: LENGTH - 1,
  });
  const [active, setActive] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openSong, setOpenSong] = useState<string | null>(null);

  /**
   * A quick range owns the window; dragging the brush switches to "custom" and
   * keeps its own edges. Deriving the window rather than syncing it means a
   * dragged range survives a reload, and a longer dataset cannot leave a stored
   * range pointing off the end of the axis.
   */
  const span = useMemo(() => {
    if (rangeKey === "custom") {
      const to = Math.min(LENGTH - 1, Math.max(1, customSpan.to));
      return { from: Math.min(to - 1, Math.max(0, customSpan.from)), to };
    }
    const preset = RANGES.find((range) => range.key === rangeKey);
    return { from: Math.max(0, LENGTH - (preset?.days ?? LENGTH)), to: LENGTH - 1 };
  }, [rangeKey, customSpan]);

  useEffect(() => setActive(null), [span.from, span.to, groupBy, metric, view, smooth]);

  const songs = useMemo(
    () =>
      musicData.songs.map((song) => ({
        ...song,
        category: (overrides[song.id] ?? song.category) as Category,
      })),
    [overrides],
  );

  /** Per-song daily counts on the shared axis, with the label halving applied. */
  const daily = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const song of songs) {
      const values = expand(song, LENGTH);
      map.set(song.id, halfLabel && song.category === "label" ? values.map((v) => v / 2) : values);
    }
    return map;
  }, [songs, halfLabel]);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const shown = useMemo(() => songs.filter((song) => !hiddenSet.has(song.id)), [songs, hiddenSet]);

  const { from, to } = span;
  const windowDays = useMemo(() => DAYS.slice(from, to + 1), [from, to]);
  const windowLength = windowDays.length;

  const totals = useMemo(() => {
    const own = new Array<number>(LENGTH).fill(0);
    const label = new Array<number>(LENGTH).fill(0);
    for (const song of shown) {
      const values = daily.get(song.id)!;
      const target = song.category === "label" ? label : own;
      for (let index = 0; index < LENGTH; index += 1) target[index] += values[index];
    }
    const all = own.map((value, index) => value + label[index]);
    return { own, label, all };
  }, [shown, daily]);

  const stats = useMemo(
    () => songs.map((song) => computeStats(song, daily.get(song.id)!, DAYS, from, to)),
    [songs, daily, from, to],
  );
  const statsById = useMemo(() => new Map(stats.map((row) => [row.id, row])), [stats]);
  const shownStats = useMemo(
    () => stats.filter((row) => !hiddenSet.has(row.id)),
    [stats, hiddenSet],
  );

  const grouped = useMemo(() => groupDays(windowDays, groupBy), [windowDays, groupBy]);

  const seriesFor = (values: number[]) => {
    const sliced = values.slice(from, to + 1);
    let bucketed = applyGrouping(sliced, grouped);
    if (metric === "cumulative") {
      const before = values.slice(0, from).reduce((sum, value) => sum + value, 0);
      bucketed = cumulate(bucketed).map((value) => value + before);
    } else if (groupBy === "day" && smooth > 1) {
      bucketed = movingAverage(bucketed, smooth);
    }
    return bucketed;
  };

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (view === "split") {
      const own = { key: "own", label: "My songs", color: CATEGORY_COLOR.own, values: seriesFor(totals.own) };
      const label = {
        key: "label",
        label: "Label songs",
        color: CATEGORY_COLOR.label,
        values: seriesFor(totals.label),
      };
      return [own, label].filter((item) => item.values.some((value) => value > 0));
    }
    const ranked = [...shownStats].sort((a, b) => b.windowTotal - a.windowTotal);
    const lead = ranked.slice(0, MAX_SONG_SERIES);
    const rest = ranked.slice(MAX_SONG_SERIES);
    const result: ChartSeries[] = lead.map((song, index) => ({
      key: song.id,
      label: song.name,
      color: SERIES_COLORS[index],
      values: seriesFor(daily.get(song.id)!),
    }));
    if (rest.length) {
      const combined = new Array<number>(LENGTH).fill(0);
      for (const song of rest) {
        const values = daily.get(song.id)!;
        for (let index = 0; index < LENGTH; index += 1) combined[index] += values[index];
      }
      result.push({
        key: "other",
        label: `Other (${rest.length})`,
        color: OTHER_COLOR,
        values: seriesFor(combined),
      });
    }
    return result;
    // `seriesFor` is a closure over exactly the values listed here, so naming
    // them is the same thing as naming it, and it does not have to be a hook.
  }, [view, totals, shownStats, daily, grouped, metric, smooth, groupBy, from, to]);

  const displaySeries = useMemo<ChartSeries[]>(() => {
    if (metric !== "share") return chartSeries;
    return chartSeries.map((item) => ({
      ...item,
      values: item.values.map((value, index) => {
        const sum = chartSeries.reduce((total, other) => total + other.values[index], 0);
        return sum > 0 ? (value / sum) * 100 : 0;
      }),
    }));
  }, [chartSeries, metric]);

  const stacked = metric === "share" || chartType !== "line";
  const effectiveType = metric === "share" && chartType === "line" ? "area" : chartType;

  // ── Headline numbers, against the window immediately before this one ────────
  const windowSum = (values: number[]) =>
    values.slice(from, to + 1).reduce((sum, value) => sum + value, 0);
  // A window is only comparable when the same length of history sits behind it,
  // otherwise "+170%" is really "the data started here".
  const previousSum = (values: number[]) => {
    if (from < windowLength) return null;
    return values.slice(from - windowLength, from).reduce((sum, value) => sum + value, 0);
  };
  const change = (values: number[]) => {
    const before = previousSum(values);
    const now = windowSum(values);
    if (before == null || before <= 0) return null;
    return ((now - before) / before) * 100;
  };

  const totalStreams = windowSum(totals.all);
  const ownStreams = windowSum(totals.own);
  const labelStreams = windowSum(totals.label);
  const perDay = windowLength ? totalStreams / windowLength : 0;
  const ownShare = totalStreams > 0 ? (ownStreams / totalStreams) * 100 : 0;

  const activeBucket = active != null && active < grouped.keys.length ? active : null;
  const readoutStart = activeBucket != null ? grouped.starts[activeBucket] : grouped.starts.at(-1);
  const readoutEnd = activeBucket != null ? grouped.ends[activeBucket] : grouped.ends.at(-1);
  const readoutIndex = activeBucket ?? grouped.keys.length - 1;

  const insights = useMemo(() => buildInsights(shownStats), [shownStats]);

  const ranked = useMemo(() => {
    const rank: Record<SortKey, (row: SongStats) => number> = {
      momentum: (row) => row.momentum,
      week: (row) => row.weekGrowth ?? -Infinity,
      month: (row) => row.monthGrowth ?? -Infinity,
      recent: (row) => row.last7avg,
      total: (row) => row.windowTotal,
      trend: (row) => row.trendSlope,
    };
    return [...shownStats].sort((a, b) => rank[sortKey](b) - rank[sortKey](a));
  }, [shownStats, sortKey]);

  const milestoneRows = useMemo(() => {
    return songs
      .map((song) => {
        const values = daily.get(song.id)!;
        const { hits, lifetime } = milestoneDays(values, DAYS);
        const next = MILESTONES.find((target) => target > lifetime) ?? null;
        const stat = statsById.get(song.id);
        const rate = stat?.last30avg ?? 0;
        return {
          song,
          hits,
          lifetime,
          next,
          reached: MILESTONES.filter((target) => hits[target]),
          etaDays: next && rate > 0 ? Math.ceil((next - lifetime) / rate) : null,
        };
      })
      .filter((row) => row.reached.length || row.next)
      .sort((a, b) => b.lifetime - a.lifetime);
  }, [songs, daily, statsById]);

  const upcoming = releases.filter((row) => row.upcoming);
  const recent = releases.filter((row) => !row.upcoming).slice(-8).reverse();
  const earnings = musicData.earnings;

  function toggleSong(id: string) {
    setHidden((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function setCategory(id: string, category: Category) {
    setOverrides((current) => ({ ...current, [id]: category }));
  }

  const detail = openSong ? songs.find((song) => song.id === openSong) : null;

  return (
    <div
      className="os-enter mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-3 pt-2 sm:px-4 sm:pt-3 md:pb-5"
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        paddingBottom: "calc(5.25rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-baseline gap-2">
        <h1 className="shrink-0 text-lg font-semibold tracking-tight sm:text-xl">Music</h1>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {shown.length === songs.length
            ? `${songs.length} songs`
            : `${shown.length}/${songs.length} songs`}
          {" · to "}
          {fullDay(musicData.to)}
        </p>
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[0.7rem] font-semibold",
            filtersOpen ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground",
          )}
        >
          <SlidersHorizontalIcon className="size-3.5" />
          Songs
        </button>
      </div>

      {/* Headline numbers */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile
          label="Streams"
          value={count(totalStreams)}
          delta={change(totals.all)}
          hint={`in ${windowLength}d`}
        />
        <StatTile
          label="My songs"
          value={count(ownStreams)}
          delta={change(totals.own)}
          hint={`${Math.round(ownShare)}% of window`}
          color={CATEGORY_COLOR.own}
        />
        <StatTile
          label="Label songs"
          value={count(labelStreams)}
          delta={change(totals.label)}
          hint={halfLabel ? "halved for the split" : `${Math.round(100 - ownShare)}% of window`}
          color={CATEGORY_COLOR.label}
        />
        <StatTile label="Per day" value={count(perDay)} hint={`peak ${brief(Math.max(...totals.all.slice(from, to + 1), 0))}`} />
      </section>

      {/* Song picker */}
      {filtersOpen ? (
        <SongPicker
          songs={songs}
          statsById={statsById}
          hidden={hiddenSet}
          onToggle={toggleSong}
          onCategory={setCategory}
          onAll={(next) => setHidden(next ? [] : songs.map((song) => song.id))}
          onGroup={(category, visible) =>
            setHidden((current) => {
              const set = new Set(current);
              for (const song of songs) {
                if (song.category !== category) continue;
                if (visible) set.delete(song.id);
                else set.add(song.id);
              }
              return [...set];
            })
          }
          halfLabel={halfLabel}
          onHalfLabel={setHalfLabel}
          onReset={() => setOverrides({})}
          overrideCount={Object.keys(overrides).length}
        />
      ) : null}

      {/* The chart */}
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2.5 pb-1.5">
          <Segmented
            label="Measure"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "daily", label: "Streams", title: "Streams per bucket" },
              { value: "cumulative", label: "Total", title: "Running total" },
              { value: "share", label: "Share", title: "Share of the total" },
            ]}
          />
          <span className="flex-1" />
          <Segmented
            label="Breakdown"
            value={view}
            onChange={setView}
            options={[
              { value: "split", label: "Split", title: "My songs against label songs" },
              { value: "songs", label: "Songs", title: "One line per song" },
            ]}
          />
        </div>

        {/* The readout sits above the plot so a finger never covers it, and every
            series is named there — identity is never colour alone. */}
        <div className="px-3 pb-1.5">
          <div className="flex items-baseline gap-2">
            <p className="text-lg leading-tight font-semibold tabular-nums">
              {metric === "share"
                ? `${Math.round(displaySeries[0]?.values[readoutIndex] ?? 0)}%`
                : count(chartSeries.reduce((sum, item) => sum + (item.values[readoutIndex] ?? 0), 0))}
            </p>
            <p className="min-w-0 flex-1 truncate text-[0.7rem] font-medium text-muted-foreground">
              {groupBy === "day"
                ? fullDay(readoutStart ?? "")
                : `${shortDay(readoutStart ?? "")} – ${fullDay(readoutEnd ?? "")}`}
              {activeBucket == null ? " · latest" : ""}
              {metric === "daily" && smooth > 1 && groupBy === "day" ? ` · ${smooth}d avg` : ""}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
            {displaySeries.map((item) => (
              <span key={item.key} className="flex items-center gap-1 text-[0.68rem]">
                <Swatch color={item.color} />
                <span className="max-w-[8rem] truncate text-muted-foreground">{item.label}</span>
                <span className="font-semibold tabular-nums">
                  {metric === "share"
                    ? `${Math.round(item.values[readoutIndex] ?? 0)}%`
                    : brief(item.values[readoutIndex] ?? 0)}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="px-1">
          {displaySeries.length ? (
            <MusicChart
              dates={grouped.starts}
              series={displaySeries}
              type={effectiveType}
              stacked={stacked}
              height={210}
              active={active}
              onActive={setActive}
              yMax={metric === "share" ? 100 : undefined}
              formatY={metric === "share" ? (value) => `${Math.round(value)}%` : undefined}
              formatX={(day) => (groupBy === "month" ? shortMonth(day.slice(0, 7)) : shortDay(day))}
            />
          ) : (
            <EmptyState title="No songs selected" detail="Turn a song back on to draw the chart." />
          )}
        </div>

        {/* Drag either edge, or the middle, to set the window. */}
        <div className="px-1 pb-1">
          <RangeBrush
            values={totals.all}
            dates={DAYS}
            from={from}
            to={to}
            onChange={(nextFrom, nextTo) => {
              setRangeKey("custom");
              setCustomSpan({ from: nextFrom, to: nextTo });
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2.5 py-2">
          <Segmented
            label="Range"
            value={rangeKey}
            onChange={setRangeKey}
            options={[
              ...RANGES.map((range) => ({ value: range.key as RangeKey, label: range.label })),
              ...(rangeKey === "custom"
                ? [{ value: "custom" as RangeKey, label: `${windowLength}d`, title: "Dragged range" }]
                : []),
            ]}
          />
          <span className="hidden flex-1 sm:block" />
          <Segmented
            label="Bucket"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: "day", label: "D", title: "One point per day" },
              { value: "week", label: "W", title: "One point per week" },
              { value: "month", label: "M", title: "One point per month" },
            ]}
          />
          <Segmented
            label="Shape"
            value={chartType}
            onChange={setChartType}
            options={[
              { value: "line", label: <ChartLineIcon className="size-3.5" />, title: "Line" },
              { value: "area", label: <ChartAreaIcon className="size-3.5" />, title: "Area" },
              { value: "bar", label: <ChartColumnIcon className="size-3.5" />, title: "Bars" },
            ]}
          />
          {metric === "daily" && groupBy === "day" ? (
            <select
              aria-label="Smoothing"
              title="Rolling average"
              className="rounded-lg bg-muted px-2 py-1.5 text-[0.7rem] font-semibold text-muted-foreground"
              value={String(smooth)}
              onChange={(event) => setSmooth(Number(event.target.value))}
            >
              <option value="1">Raw</option>
              <option value="7">7d avg</option>
              <option value="14">14d avg</option>
              <option value="30">30d avg</option>
            </select>
          ) : null}
        </div>
      </section>

      {/* Insights */}
      {insights.length ? (
        <section className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {insights.map((insight) => (
            <InsightCard key={insight.title} {...insight} />
          ))}
        </section>
      ) : null}

      {/* Catalog */}
      <Panel
        title="Catalog"
        action={
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Sort catalog"
              className="rounded-lg bg-muted px-2 py-1 text-[0.7rem] font-semibold text-muted-foreground"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={catalogView === "list" ? "Show the table" : "Show the list"}
              title={catalogView === "list" ? "Show the table" : "Show the list"}
              onClick={() => setCatalogView((current) => (current === "list" ? "table" : "list"))}
              className="rounded-lg bg-muted p-1.5 text-muted-foreground"
            >
              {catalogView === "list" ? (
                <Columns3Icon className="size-3.5" />
              ) : (
                <ListIcon className="size-3.5" />
              )}
            </button>
          </div>
        }
        footer={`${windowLength} days on screen · tap a song for its own chart · momentum weighs 7-day and 30-day growth against the 90-day trend.`}
      >
        {catalogView === "list" ? (
          <div>
            {ranked.map((song, index) => (
              <button
                key={song.id}
                type="button"
                onClick={() => setOpenSong(song.id)}
                className="flex w-full min-h-11 items-center gap-2.5 border-t border-border px-3 py-2 text-left first:border-t-0 hover:bg-muted/60"
              >
                <span className="w-4 shrink-0 text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Swatch color={CATEGORY_COLOR[song.category]} />
                    <span className="truncate text-sm font-medium">{song.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[0.7rem] text-muted-foreground">
                    {count(song.windowTotal)} · {count(song.last7avg)}/day · peak {brief(song.peak)}
                  </span>
                </span>
                <MiniSpark values={song.spark} color={CATEGORY_COLOR[song.category]} />
                <span className="w-12 shrink-0 text-right">
                  <span className={cn("block text-sm font-semibold tabular-nums", growthTone(song.weekGrowth))}>
                    {growthLabel(song.weekGrowth)}
                  </span>
                  <span className={cn("block text-[0.65rem] tabular-nums", growthTone(song.monthGrowth))}>
                    {growthLabel(song.monthGrowth)}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-t border-border text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-1.5 text-left font-semibold">Song</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Cat</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Streams</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Per day</th>
                  <th className="px-2 py-1.5 text-right font-semibold">7d avg</th>
                  <th className="px-2 py-1.5 text-right font-semibold">7d</th>
                  <th className="px-2 py-1.5 text-right font-semibold">30d</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Peak</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Lifetime</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((song) => (
                  <tr
                    key={song.id}
                    onClick={() => setOpenSong(song.id)}
                    className="cursor-pointer border-t border-border hover:bg-muted/60"
                  >
                    <td className="max-w-[12rem] truncate px-3 py-1.5 font-medium">{song.name}</td>
                    <td className="px-2 py-1.5">
                      <Swatch color={CATEGORY_COLOR[song.category]} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{count(song.windowTotal)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{count(song.avgDaily)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{count(song.last7avg)}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", growthTone(song.weekGrowth))}>
                      {growthLabel(song.weekGrowth)}
                    </td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", growthTone(song.monthGrowth))}>
                      {growthLabel(song.monthGrowth)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{count(song.peak)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{count(song.lifetime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Milestones */}
      <Panel title="Milestones" footer="Lifetime totals across everything scraped, not just the window above.">
        <div className="grid gap-x-4 gap-y-2 px-3 py-2 sm:grid-cols-2">
          {milestoneRows.slice(0, 10).map((row) => (
            <div key={row.song.id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5">
                  <Swatch color={CATEGORY_COLOR[row.song.category]} />
                  <span className="truncate text-sm font-medium">{row.song.name}</span>
                </p>
                <p className="shrink-0 text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
                  {brief(row.lifetime)}
                  {row.next ? ` / ${formatMilestone(row.next)}` : ""}
                </p>
              </div>
              {row.next ? (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand-gradient"
                    style={{ width: `${Math.min(100, (row.lifetime / row.next) * 100)}%` }}
                  />
                </div>
              ) : null}
              <p className="mt-1 flex flex-wrap items-center gap-1 text-[0.65rem] text-muted-foreground">
                {row.reached.map((target) => (
                  <span key={target} className="rounded bg-muted px-1 py-px font-semibold tabular-nums">
                    {formatMilestone(target)}
                  </span>
                ))}
                {row.etaDays != null && row.etaDays < 3650 ? (
                  <span>· {formatMilestone(row.next!)} in ~{count(row.etaDays)}d</span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Earnings */}
      {earnings ? <EarningsSection earnings={earnings} /> : null}

      {/* Catalog dates */}
      <div className="grid gap-2 lg:grid-cols-2">
        <Panel title="Coming up">
          {upcoming.length ? (
            upcoming.map((row) => (
              <Row
                key={`${row.slug}-${row.date}`}
                href={row.spotifyUrl}
                external={Boolean(row.spotifyUrl)}
                primary={row.title}
                secondary={row.date >= todayYmd ? "Scheduled" : undefined}
                value={fullDay(row.date)}
                valueTone="muted"
              />
            ))
          ) : (
            <EmptyState title="Nothing scheduled" detail="No future release dates in the public catalog." />
          )}
        </Panel>
        <Panel title="Recently released">
          {recent.map((row) => (
            <Row
              key={`${row.slug}-${row.date}`}
              href={row.spotifyUrl}
              external={Boolean(row.spotifyUrl)}
              primary={row.title}
              value={fullDay(row.date)}
              valueTone="muted"
            />
          ))}
        </Panel>
      </div>

      <p className="pt-1 text-xs leading-snug text-muted-foreground">
        Scraped {fullDay(musicData.scrapedAt ?? musicData.to)} from Spotify for Artists · refresh with{" "}
        <code className="rounded bg-muted px-1 py-px font-mono text-[0.7rem]">npm run music:sync</code>
        {followers != null ? ` · ${count(followers)} followers` : ""}
        {sources.some((source) => source.id === "spotify" && !source.wired)
          ? " · no live Spotify connection, so nothing here moves on its own"
          : ""}
      </p>

      {detail ? (
        <SongSheet
          song={detail}
          stats={statsById.get(detail.id)!}
          values={daily.get(detail.id)!}
          onClose={() => setOpenSong(null)}
          onCategory={(category) => setCategory(detail.id, category)}
          share={totalStreams > 0 ? (statsById.get(detail.id)!.windowTotal / totalStreams) * 100 : 0}
        />
      ) : null}
    </div>
  );
}

// ── Song picker ───────────────────────────────────────────────────────────────
function SongPicker({
  songs,
  statsById,
  hidden,
  onToggle,
  onCategory,
  onAll,
  onGroup,
  halfLabel,
  onHalfLabel,
  onReset,
  overrideCount,
}: {
  songs: Array<{ id: string; name: string; category: Category }>;
  statsById: Map<string, SongStats>;
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onCategory: (id: string, category: Category) => void;
  onAll: (visible: boolean) => void;
  onGroup: (category: Category, visible: boolean) => void;
  halfLabel: boolean;
  onHalfLabel: (next: boolean) => void;
  onReset: () => void;
  overrideCount: number;
}) {
  const groups: Array<{ category: Category; title: string }> = [
    { category: "own", title: "My songs" },
    { category: "label", title: "Label songs" },
  ];

  return (
    <section className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
      {groups.map((group) => {
        const rows = songs
          .filter((song) => song.category === group.category)
          .sort(
            (a, b) => (statsById.get(b.id)?.lifetime ?? 0) - (statsById.get(a.id)?.lifetime ?? 0),
          );
        if (!rows.length) return null;
        return (
          <div key={group.category} className="mb-2 last:mb-0">
            <div className="mb-1.5 flex items-center gap-2">
              <Swatch color={CATEGORY_COLOR[group.category]} />
              <p className="text-[0.7rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {group.title}
              </p>
              <button
                type="button"
                onClick={() => onGroup(group.category, true)}
                className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => onGroup(group.category, false)}
                className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground"
              >
                None
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rows.map((song) => {
                const off = hidden.has(song.id);
                return (
                  <span
                    key={song.id}
                    className={cn(
                      "flex items-center overflow-hidden rounded-full ring-1",
                      off ? "opacity-50 ring-foreground/10" : "ring-foreground/15",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={!off}
                      onClick={() => onToggle(song.id)}
                      className="flex max-w-[12rem] items-center gap-1.5 py-1 pr-1.5 pl-2 text-[0.72rem] font-medium"
                    >
                      <Swatch color={CATEGORY_COLOR[song.category]} />
                      <span className="truncate">{song.name}</span>
                    </button>
                    <button
                      type="button"
                      title="Move between my songs and label songs"
                      onClick={() =>
                        onCategory(song.id, song.category === "own" ? "label" : "own")
                      }
                      className="border-l border-border px-1.5 py-1 text-[0.6rem] font-bold tracking-wide text-muted-foreground uppercase"
                    >
                      {song.category === "own" ? "own" : "lbl"}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <button
          type="button"
          onClick={() => onAll(true)}
          className="rounded bg-muted px-2 py-1 text-[0.68rem] font-semibold text-muted-foreground"
        >
          Show all
        </button>
        <button
          type="button"
          onClick={() => onAll(false)}
          className="rounded bg-muted px-2 py-1 text-[0.68rem] font-semibold text-muted-foreground"
        >
          Hide all
        </button>
        <button
          type="button"
          onClick={() => onHalfLabel(!halfLabel)}
          aria-pressed={halfLabel}
          title="Halve label streams to show the roughly 50% share that reaches you"
          className={cn(
            "rounded px-2 py-1 text-[0.68rem] font-semibold",
            halfLabel ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground",
          )}
        >
          ÷2 label
        </button>
        {overrideCount ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded bg-muted px-2 py-1 text-[0.68rem] font-semibold text-muted-foreground"
          >
            Reset {overrideCount} tag{overrideCount === 1 ? "" : "s"}
          </button>
        ) : null}
        <p className="basis-full text-[0.65rem] text-muted-foreground">
          Tap a name to hide it, the badge to move it between my songs and label. Both are kept on
          this device.
        </p>
      </div>
    </section>
  );
}

// ── Song sheet ────────────────────────────────────────────────────────────────
function SongSheet({
  song,
  stats,
  values,
  share,
  onClose,
  onCategory,
}: {
  song: { id: string; name: string; category: Category };
  stats: SongStats;
  values: number[];
  share: number;
  onClose: () => void;
  onCategory: (category: Category) => void;
}) {
  const [days, setDays] = useState<number>(90);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const from = Math.max(0, LENGTH - days);
  const windowDays = DAYS.slice(from);
  const windowValues = values.slice(from);
  const groupBy: GroupBy = days > 200 ? "week" : "day";
  const grouped = groupDays(windowDays, groupBy);
  const series: ChartSeries[] = [
    {
      key: song.id,
      label: song.name,
      color: CATEGORY_COLOR[song.category],
      values: applyGrouping(windowValues, grouped),
    },
  ];
  const { hits, lifetime } = milestoneDays(values, DAYS);
  const readout = active ?? grouped.keys.length - 1;
  // The stats block is scoped to the window on the page; this one fact is not.
  const firstEver = DAYS[values.findIndex((value) => value > 0)] ?? null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center"
      style={{ zIndex: zIndex.overlay }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={song.name}
        onClick={(event) => event.stopPropagation()}
        className="os-pop-in flex max-h-[92dvh] w-full max-w-[36rem] flex-col overflow-y-auto rounded-t-2xl bg-card ring-1 ring-foreground/10 sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="sticky top-0 flex items-start gap-2 border-b border-border bg-card px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{song.name}</p>
            <p className="text-xs text-muted-foreground">
              {count(lifetime)} lifetime · {Math.round(share * 10) / 10}% of the window
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCategory(song.category === "own" ? "label" : "own")}
            className="shrink-0"
            title="Move between my songs and label songs"
          >
            <Pill tone={song.category === "own" ? "brand" : "muted"}>
              {song.category === "own" ? "My song" : "Label"}
            </Pill>
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 p-1 text-muted-foreground">
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <Segmented
            label="Range"
            value={String(days)}
            onChange={(next) => {
              setDays(Number(next));
              setActive(null);
            }}
            options={[
              { value: "30", label: "30D" },
              { value: "90", label: "90D" },
              { value: "365", label: "1Y" },
              { value: String(LENGTH), label: "All" },
            ]}
          />
          <p className="text-right text-xs">
            <span className="block text-[0.68rem] text-muted-foreground">
              {grouped.starts[readout] ? shortDay(grouped.starts[readout]) : ""}
            </span>
            <span className="block text-sm font-semibold tabular-nums">
              {count(series[0].values[readout] ?? 0)}
            </span>
          </p>
        </div>

        <div className="px-1">
          <MusicChart
            dates={grouped.starts}
            series={series}
            type="area"
            height={170}
            active={active}
            onActive={setActive}
            formatX={(day) => shortDay(day)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 px-3 pt-1 sm:grid-cols-4">
          <KpiCard label="Per day (7d)" value={count(stats.last7avg)} hint={growthLabel(stats.weekGrowth)} />
          <KpiCard label="Per day (30d)" value={count(stats.last30avg)} hint={growthLabel(stats.monthGrowth)} />
          <KpiCard label="Peak day" value={count(stats.peak)} hint={fullDay(stats.peakDay ?? "")} />
          <KpiCard
            label="Next 30d"
            value={brief(stats.projected30)}
            hint={`trend ${stats.trendSlope > 0 ? "+" : ""}${
              Math.abs(stats.trendSlope) < 10
                ? Math.round(stats.trendSlope * 10) / 10
                : Math.round(stats.trendSlope)
            }/day`}
          />
        </div>

        <div className="px-3 py-3">
          <p className="mb-1.5 text-[0.7rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            Milestones
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
            {MILESTONES.map((target) => (
              <div key={target} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold tabular-nums">{formatMilestone(target)}</span>
                <span className={hits[target] ? "text-foreground" : "text-muted-foreground"}>
                  {hits[target] ? fullDay(hits[target]) : "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            First scraped play {fullDay(firstEver ?? "")} · {count(stats.activeDays)} days with plays
            inside the window on the page.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Earnings ───────────────────────────────────────────────────────────────
const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en-GB"], { type: "region" })
    : null;

function countryName(code: string) {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

type Breakdown = "store" | "country" | "release";

/** A ranked row with its all-time bar and how the last three months went. */
function EarnRow({
  label,
  sub,
  value,
  max,
  recent,
  growth,
  dot,
}: {
  label: string;
  sub?: string;
  value: number;
  max: number;
  recent: number;
  growth: number | null;
  dot?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border px-3 py-1.5 first:border-t-0">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          {dot ? <Swatch color={dot} /> : null}
          <span className="truncate">{label}</span>
          {sub ? <span className="shrink-0 text-muted-foreground">{sub}</span> : null}
        </p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-gradient"
            style={{ width: `${Math.max(1.5, (value / max) * 100)}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold tabular-nums">{usd(value)}</p>
        <p className="text-[0.65rem] leading-tight tabular-nums text-muted-foreground">
          {/* Under a dollar the percentage is noise, so only the fact is shown. */}
          {recent < 1 ? (
            "nothing last 3mo"
          ) : (
            <>
              {usd(recent)} last 3mo{" "}
              <span className={cn("font-semibold", growthTone(growth))}>{growthLabel(growth)}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function EarningsSection({ earnings }: { earnings: NonNullable<typeof musicData.earnings> }) {
  const [active, setActive] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useStickyState<Breakdown>("os-music-breakdown", "store");
  const { account, transactions } = earnings;

  if (!transactions) {
    return account ? (
      <KpiGrid>
        <KpiCard label="Earned all time" value={usd(account.totalEarnedUsd ?? 0)} hint="DistroKid balance page" />
        <KpiCard label="Withdrawn" value={usd(account.totalWithdrawnUsd ?? 0)} hint="paid out" />
        <KpiCard label="Balance" value={usd(account.balanceUsd ?? 0)} hint="not yet withdrawn" />
      </KpiGrid>
    ) : null;
  }

  const months = transactions.months.slice(-24);
  const firstPartial = months.findIndex((row) => row.partial);
  const settled = transactions.months.filter((row) => !row.partial);
  const lastThree = settled.slice(-3);
  const perMonth = lastThree.length
    ? lastThree.reduce((sum, row) => sum + row.earnUsd, 0) / lastThree.length
    : 0;
  const best = settled.reduce(
    (top, row) => (row.earnUsd > (top?.earnUsd ?? 0) ? row : top),
    settled[0],
  );

  const series: ChartSeries[] = transactions.byMonthStore.map((row, index) => ({
    key: row.store,
    label: row.store,
    color: row.store === "Other" ? OTHER_COLOR : SERIES_COLORS[index],
    values: row.values.slice(-24),
  }));

  const readout = active ?? months.length - 1;
  const readoutMonth = months[readout];

  const rows =
    breakdown === "store"
      ? transactions.stores.slice(0, 10).map((row) => ({
          key: row.store,
          label: row.store,
          sub: row.pps ? `$${row.pps.toFixed(5)}/play` : undefined,
          value: row.earnUsd,
          recent: row.recentUsd,
          growth: row.growth,
          dot: undefined as string | undefined,
        }))
      : breakdown === "country"
        ? transactions.countries.slice(0, 12).map((row) => ({
            key: row.code,
            label: countryName(row.code),
            sub: `${brief(row.qty)} plays`,
            value: row.earnUsd,
            recent: row.recentUsd,
            growth: row.growth,
            dot: undefined as string | undefined,
          }))
        : transactions.titles.slice(0, 12).map((row) => ({
            key: row.title,
            label: row.title,
            sub: undefined,
            value: row.earnUsd,
            recent: row.recentUsd,
            growth: row.growth,
            dot: row.category ? CATEGORY_COLOR[row.category] : undefined,
          }));
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <>
      <SectionLabel>Earnings</SectionLabel>

      <KpiGrid>
        <KpiCard
          label="Earned all time"
          value={usd(transactions.totalEarnedUsd)}
          hint={`sales to ${shortMonth(transactions.to)} · export ${fullDay(transactions.exportedOn)}`}
        />
        <KpiCard
          label="Per month"
          value={usd(perMonth)}
          hint={`last 3 settled · best ${usd(best?.earnUsd ?? 0)} in ${shortMonth(best?.month ?? "")}`}
        />
        <KpiCard
          label="Balance"
          value={usd(account?.balanceUsd ?? 0)}
          hint={
            account
              ? `${usd(account.totalWithdrawnUsd ?? 0)} withdrawn · ${fullDay(account.scrapedAt)}`
              : "not scraped"
          }
        />
        <KpiCard
          label="Per Spotify play"
          value={`$${(transactions.ratePerSpotifyStreamUsd ?? 0).toFixed(5)}`}
          hint="every store's money, over Spotify plays"
        />
      </KpiGrid>

      <Panel
        title="Monthly earnings"
        action={
          <span className="text-right text-xs">
            <span className="block text-[0.68rem] text-muted-foreground">
              {readoutMonth ? shortMonth(readoutMonth.month) : ""}
              {readoutMonth?.partial ? " · still reporting" : ""}
            </span>
            <span className="block text-sm font-semibold tabular-nums">
              {usd(readoutMonth?.earnUsd ?? 0)}
            </span>
          </span>
        }
        footer={`Sale month, not payout month — a month keeps filling in for about ${transactions.avgDelayDays ?? 45} days after it ends and is only settled after ten weeks. ${
          transactions.completeThrough
            ? `Everything after ${shortMonth(transactions.completeThrough)} is drawn faded because it is still arriving.`
            : ""
        }`}
      >
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 px-3 pb-1">
          {series.map((item) => (
            <span key={item.key} className="flex items-center gap-1 text-[0.68rem]">
              <Swatch color={item.color} />
              <span className="max-w-[8rem] truncate text-muted-foreground">{item.label}</span>
              <span className="font-semibold tabular-nums">
                {usd(item.values[readout] ?? 0)}
              </span>
            </span>
          ))}
        </div>
        <div className="px-1 pb-1">
          <MusicChart
            dates={months.map((row) => `${row.month}-01`)}
            series={series}
            type="bar"
            stacked
            height={160}
            active={active}
            onActive={setActive}
            dimFrom={firstPartial >= 0 ? firstPartial : undefined}
            formatY={(value) => `$${briefNumber(value)}`}
            formatX={(day) => shortMonth(day.slice(0, 7))}
          />
        </div>
      </Panel>

      <Panel
        title="Breakdown"
        action={
          <Segmented
            label="Breakdown"
            value={breakdown}
            onChange={setBreakdown}
            options={[
              { value: "store", label: "Store" },
              { value: "country", label: "Country" },
              { value: "release", label: "Release" },
            ]}
          />
        }
        footer="Bars are all-time; the second figure is the last three settled months against the three before them."
      >
        {rows.map(({ key, ...row }) => (
          <EarnRow key={key} {...row} max={max} />
        ))}
      </Panel>

      {account?.withdrawals.length ? (
        <Panel
          title="Withdrawals"
          action={
            <span className="text-xs text-muted-foreground">
              {account.withdrawals.length} payouts
            </span>
          }
          footer={`Scraped from the DistroKid account on ${fullDay(account.scrapedAt)}; newer payouts will not appear until it is scraped again.`}
        >
          <div className="px-3 py-2">
            <RankedBars
              rows={account.withdrawals.slice(0, 8).map((row) => ({
                key: row.date,
                label: fullDay(row.date),
                value: row.amountUsd,
              }))}
              format={usd}
            />
          </div>
        </Panel>
      ) : null}
    </>
  );
}

// ── Insights ──────────────────────────────────────────────────────────────────
type Insight = {
  title: string;
  main: string;
  detail: string;
  chip?: string;
  tone: "positive" | "negative" | "neutral";
};

/**
 * The same read the old analytics page did: which song is moving, which is
 * fading, is the catalog as a whole up or down, and where the next push would
 * pay off.
 */
function buildInsights(stats: SongStats[]): Insight[] {
  if (!stats.length) return [];
  const cards: Insight[] = [];
  const byWeek = stats.filter((row) => row.weekGrowth !== null).sort((a, b) => b.weekGrowth! - a.weekGrowth!);
  const byMonth = stats
    .filter((row) => row.monthGrowth !== null)
    .sort((a, b) => b.monthGrowth! - a.monthGrowth!);

  if (byWeek.length && byWeek[0].weekGrowth! > 5) {
    const song = byWeek[0];
    cards.push({
      title: "Fastest growing · 7 days",
      main: song.name,
      chip: growthLabel(song.weekGrowth),
      tone: "positive",
      detail: `${count(song.last7avg)} a day, up from ${count(song.prev7avg)} the week before.`,
    });
  }

  const monthLeader = byMonth.find((row) => row.id !== byWeek[0]?.id);
  if (monthLeader && monthLeader.monthGrowth! > 5) {
    cards.push({
      title: "Best 30-day momentum",
      main: monthLeader.name,
      chip: growthLabel(monthLeader.monthGrowth),
      tone: "positive",
      detail: `${count(monthLeader.last30avg)} a day against ${count(monthLeader.prev30avg)} the month before.`,
    });
  }

  const decliner = byWeek.at(-1);
  if (decliner && decliner.weekGrowth! < -10) {
    cards.push({
      title: "Losing steam · 7 days",
      main: decliner.name,
      chip: growthLabel(decliner.weekGrowth),
      tone: "negative",
      detail: `Down from ${count(decliner.prev7avg)} to ${count(decliner.last7avg)} a day.`,
    });
  }

  const tracked = stats.filter((row) => row.monthGrowth !== null);
  if (tracked.length) {
    const average = tracked.reduce((sum, row) => sum + row.monthGrowth!, 0) / tracked.length;
    const growing = tracked.filter((row) => row.monthGrowth! > 5).length;
    const declining = tracked.filter((row) => row.monthGrowth! < -5).length;
    cards.push({
      title: "Catalog health",
      main: average > 10 ? "Growing" : average > 0 ? "Steady" : "Declining",
      chip: growthLabel(average),
      tone: average > 10 ? "positive" : average > 0 ? "neutral" : "negative",
      detail: `${growing} growing, ${declining} declining, ${tracked.length} with enough history to judge.`,
    });
  }

  const projected = stats.reduce((sum, row) => sum + row.projected30, 0);
  const current = stats.reduce((sum, row) => sum + row.last30avg, 0) * 30;
  if (projected > 0) {
    cards.push({
      title: "Next 30 days",
      main: `≈ ${brief(projected)} streams`,
      chip: current > 0 ? growthLabel(((projected - current) / current) * 100) : undefined,
      tone: "neutral",
      detail: `Recent trend carried forward across ${stats.length} songs.`,
    });
  }

  const focus = stats
    .filter((row) => row.weekGrowth !== null && row.weekGrowth > 5 && row.last7avg > 20)
    .sort(
      (a, b) =>
        b.weekGrowth! * Math.log(b.last7avg + 1) - a.weekGrowth! * Math.log(a.last7avg + 1),
    )[0];
  if (focus) {
    cards.push({
      title: "Worth a push",
      main: focus.name,
      chip: growthLabel(focus.weekGrowth),
      tone: "positive",
      detail: `Growing on real volume — ${count(focus.last7avg)} a day and still climbing.`,
    });
  }

  const sleeper = stats
    .filter((row) => row.lifetime > 50_000 && row.last7avg < 100)
    .sort((a, b) => b.lifetime - a.lifetime)[0];
  if (sleeper) {
    cards.push({
      title: "Sleeping giant",
      main: sleeper.name,
      tone: "neutral",
      detail: `${brief(sleeper.lifetime)} lifetime but only ${count(sleeper.last7avg)} a day now.`,
    });
  }

  return cards;
}
