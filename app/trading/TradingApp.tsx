"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  alignedReturnPct,
  applyLiveCandles,
  applyLiveQuotes,
  buildEquityCurve,
  EQUITY_RANGES,
  firstFillDate,
  formatBerlinClock,
  formatBerlinDateTime,
  formatPrice,
  formatSek,
  formatSignedPct,
  getPositionMetrics,
  getTradingDeskStats,
  seriesTotalPct,
  sliceByRange,
  stampLiveEquity,
  TRADING_INDEXES,
  type EquityRange,
  type TradingBook,
  type TradingCandle,
  type TradingIndexId,
  type TradingLiveSnapshot,
  type TradingPoint,
  type TradingPosition,
} from "@/lib/trading";

import "@/components/accounting/accounting.css";
import "./trading.css";

import { EquityChart } from "./EquityChart";
import { PositionChart } from "./PositionChart";
import { Sparkline } from "./Sparkline";

const POLL_MS = 8000;

type ChartUnit = "sek" | "pct";

type BenchmarkSeries = {
  id: TradingIndexId;
  label: string;
  color: string;
  points: TradingPoint[];
};

function pnlClass(value: number) {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
}

function formatFx(value: number) {
  return value.toLocaleString("sv-SE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function TradingApp({
  accessKey,
  book,
  charts,
  initialLive,
}: {
  accessKey: string;
  book: TradingBook;
  charts: Record<string, TradingCandle[]>;
  initialLive: TradingLiveSnapshot | null;
}) {
  const [live, setLive] = useState<TradingLiveSnapshot | null>(initialLive);
  const [seedBook, setSeedBook] = useState(book);
  const [seedCharts, setSeedCharts] = useState(charts);
  const [clock, setClock] = useState("");
  const [symbol, setSymbol] = useState<string | null>(book.positions[0]?.symbol ?? null);
  const [unit, setUnit] = useState<ChartUnit>("sek");
  const [range, setRange] = useState<EquityRange>("all");
  const [selectedIndexes, setSelectedIndexes] = useState<TradingIndexId[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkSeries[] | null>(null);
  const [benchStatus, setBenchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [benchTick, setBenchTick] = useState(0);
  const chartRef = useRef<HTMLElement>(null);
  const bookStampRef = useRef(`${book.version}:${book.updatedAt}`);

  const refreshLive = useCallback(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch(`/api/trading/${encodeURIComponent(accessKey)}/live`, { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as TradingLiveSnapshot;
      if (next?.quotes) setLive(next);
    } catch {
      /* keep last snapshot */
    }
  }, [accessKey]);

  const refreshBook = useCallback(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch(`/api/trading/${encodeURIComponent(accessKey)}/book`, { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as { book?: TradingBook; charts?: Record<string, TradingCandle[]> };
      if (!next.book) return;
      const stamp = `${next.book.version}:${next.book.updatedAt}`;
      if (stamp === bookStampRef.current) return;
      bookStampRef.current = stamp;
      setSeedBook(next.book);
      if (next.charts) setSeedCharts(next.charts);
    } catch {
      /* keep last book */
    }
  }, [accessKey]);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };
    tick();
    const clockId = window.setInterval(tick, 1000);
    const pollId = window.setInterval(() => {
      void refreshLive();
      void refreshBook();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        void refreshLive();
        void refreshBook();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void refreshLive();
    void refreshBook();
    return () => {
      window.clearInterval(clockId);
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshBook, refreshLive]);

  useEffect(() => {
    if (selectedIndexes.length === 0 || benchmarks) return;
    let cancelled = false;
    setBenchStatus("loading");
    void (async () => {
      try {
        const response = await fetch(`/api/trading/${encodeURIComponent(accessKey)}/benchmarks`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("benchmarks failed");
        const json = (await response.json()) as { series?: BenchmarkSeries[] };
        if (cancelled) return;
        setBenchmarks(json.series ?? []);
        setBenchStatus("idle");
      } catch {
        if (!cancelled) setBenchStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessKey, benchTick, benchmarks, selectedIndexes.length]);

  const liveBook = useMemo(() => applyLiveQuotes(seedBook, live), [live, seedBook]);
  const liveCharts = useMemo(
    () => applyLiveCandles(seedCharts, live, liveBook.timezone),
    [live, liveBook.timezone, seedCharts],
  );
  const quotes = live?.quotes ?? {};
  const stats = useMemo(() => getTradingDeskStats(liveBook, quotes), [liveBook, quotes]);
  const equityPoints = useMemo(
    () => stampLiveEquity(buildEquityCurve(liveBook, liveCharts), liveBook, quotes),
    [liveBook, liveCharts, quotes],
  );
  const comparePoints = useMemo(
    () => sliceByRange(equityPoints, range, firstFillDate(liveBook)),
    [equityPoints, liveBook, range],
  );
  const curvePct = seriesTotalPct(comparePoints);
  const capitalPct = liveBook.experiment.capitalSek
    ? (stats.openPnlSek / liveBook.experiment.capitalSek) * 100
    : 0;
  const dayPct = liveBook.experiment.capitalSek
    ? (stats.dayPnlSek / liveBook.experiment.capitalSek) * 100
    : 0;
  const activeOverlays = (benchmarks ?? []).filter((row) => selectedIndexes.includes(row.id));
  const comparisons = activeOverlays.map((row) => ({
    id: row.id,
    label: row.label,
    color: row.color,
    ...alignedReturnPct(comparePoints, row.points),
  }));
  const selected = liveBook.positions.find((position) => position.symbol === symbol) ?? null;
  const selectedMetrics = selected ? getPositionMetrics(selected, liveBook, quotes, stats.marketUsd) : null;
  const liveOn = live?.session === "open" && !live.stale;
  const statusLabel = !live
    ? "Seed"
    : live.session === "pre"
      ? "Premarket"
      : live.session === "post"
        ? "After hours"
        : liveOn
          ? "Live"
          : live.session === "open"
            ? "Fördröjd"
            : "Stängt";
  const sessionClass =
    live?.session === "pre" || live?.session === "post" ? "is-extended" : liveOn ? "is-online" : "is-offline";

  useEffect(() => {
    if (!selected) return;
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected?.symbol]);

  useEffect(() => {
    if (!symbol) return;
    if (liveBook.positions.some((position) => position.symbol === symbol)) return;
    setSymbol(liveBook.positions[0]?.symbol ?? null);
  }, [liveBook.positions, symbol]);

  const toggleIndex = (id: TradingIndexId) => {
    setSelectedIndexes((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  useEffect(() => {
    if (selectedIndexes.length > 0) setUnit("pct");
  }, [selectedIndexes]);

  const retryBenchmarks = () => {
    setBenchmarks(null);
    setBenchTick((tick) => tick + 1);
  };

  return (
    <main className="accounting-app ac-shell trading-app">
      <header className="ac-topbar">
        <div className="ac-topbar-inner">
          <div className="ac-brand-lockup">
            <span className="ac-logo" aria-hidden="true">
              <Image alt="" height={42} priority src="/trading-icon-192.png" width={42} />
            </span>
            <div>
              <span className="ac-brand-name">Wallerstedt</span>
              <span className="ac-brand-subtitle">Trading</span>
            </div>
          </div>
          <div className="ac-topbar-actions">
            <span className={`ac-online-pill ${sessionClass}`} role="status">
              <span className="trading-live-dot" />
              {statusLabel}
              {clock ? ` · ${clock} NY` : ""}
            </span>
          </div>
        </div>
      </header>

      <div className="ac-page-wrap">
        <div className="ac-view">
          <section className="ac-hero-card" aria-labelledby="equity-heading">
            <div className="trading-hero-top">
              <div className="ac-hero-main">
                <span id="equity-heading">Total utveckling</span>
                <strong className={pnlClass(unit === "pct" ? curvePct : stats.openPnlSek)}>
                  {unit === "pct" ? formatSignedPct(curvePct) : formatSek(stats.equitySek)}
                </strong>
                <small>
                  {formatSignedPct(capitalPct)} {unit === "pct" ? "vs startkapital" : "totalt"} ·{" "}
                  <span className={pnlClass(stats.dayPnlSek)}>{formatSignedPct(dayPct)} idag</span>
                  {live?.fetchedAt ? ` · ${formatBerlinDateTime(live.fetchedAt, liveBook.timezone)}` : ""}
                </small>
              </div>
              <div className="trading-hero-fx">
                <span>USD/SEK</span>
                <strong>{formatFx(liveBook.fxUsdSek)}</strong>
              </div>
            </div>
            <div className="trading-compare">
              <div className="trading-chart__legend trading-compare-ranges" role="group" aria-label="Tidsperiod">
                {EQUITY_RANGES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={range === item.key ? "is-on" : ""}
                    aria-pressed={range === item.key}
                    onClick={() => setRange(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="trading-chart__legend" role="group" aria-label="Visa som">
                <button
                  type="button"
                  className={unit === "sek" ? "is-on" : ""}
                  aria-pressed={unit === "sek"}
                  onClick={() => setUnit("sek")}
                >
                  SEK
                </button>
                <button
                  type="button"
                  className={unit === "pct" ? "is-on" : ""}
                  aria-pressed={unit === "pct"}
                  onClick={() => setUnit("pct")}
                >
                  %
                </button>
              </div>
              <div className="trading-chart__legend trading-compare-indexes" role="group" aria-label="Jämför mot index">
                <span className="trading-compare-label">Jämför</span>
                {TRADING_INDEXES.map((index) => {
                  const on = selectedIndexes.includes(index.id);
                  return (
                    <button
                      key={index.id}
                      type="button"
                      className={on ? "is-on" : ""}
                      aria-pressed={on}
                      style={on ? { color: index.color } : undefined}
                      onClick={() => toggleIndex(index.id)}
                    >
                      {index.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {benchStatus === "loading" && selectedIndexes.length > 0 ? (
              <p className="trading-compare-status">Hämtar index…</p>
            ) : null}
            {benchStatus === "error" ? (
              <p className="trading-compare-status">
                Kunde inte hämta index.{" "}
                <button type="button" onClick={retryBenchmarks}>
                  Försök igen
                </button>
              </p>
            ) : null}
            {unit === "pct" && comparisons.length > 0 ? (
              <div className="trading-alpha">
                {comparisons.map((row) => (
                  <span key={row.id} style={{ color: row.color }}>
                    vs {row.label} {formatSignedPct(row.benchmarkPct)} · α {formatSignedPct(row.alpha)}
                  </span>
                ))}
              </div>
            ) : null}
            <EquityChart
              key={range}
              points={comparePoints}
              unit={unit}
              overlays={unit === "pct" ? activeOverlays : []}
            />
            <div className="trading-stat-row">
              <div>
                <span>Marknad</span>
                <strong>{formatSek(stats.marketSek)}</strong>
              </div>
              <div>
                <span>Orealiserat</span>
                <strong className={pnlClass(stats.openPnlSek)}>{formatSek(stats.openPnlSek)}</strong>
              </div>
              <div>
                <span>Idag</span>
                <strong className={pnlClass(stats.dayPnlSek)}>{formatSek(stats.dayPnlSek)}</strong>
              </div>
              <div>
                <span>Kassa</span>
                <strong>{formatSek(stats.cashSek)}</strong>
              </div>
              <div>
                <span>Exponering</span>
                <strong>{stats.exposurePct.toFixed(0)}%</strong>
              </div>
            </div>
          </section>

          <section className="ac-section-block" aria-labelledby="positions-heading">
            <div className="ac-section-heading-row">
              <h2 id="positions-heading">{liveBook.experiment.title}</h2>
              <span className="ac-count-badge">{liveBook.positions.length}</span>
            </div>
            <div className="trading-weights" aria-hidden="true">
              {liveBook.positions.map((position) => {
                const metrics = getPositionMetrics(position, liveBook, quotes, stats.marketUsd);
                return (
                  <span
                    key={position.symbol}
                    className={metrics.pnlPct >= 0 ? "is-positive" : "is-negative"}
                    style={{ width: `${Math.max(metrics.weightPct, 4)}%` }}
                    title={`${position.symbol} ${metrics.weightPct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="trading-blotter">
              <table>
                <thead>
                  <tr>
                    <th>Namn</th>
                    <th>Ant</th>
                    <th>Inköp</th>
                    <th>Senast</th>
                    <th>Idag</th>
                    <th>Värde</th>
                    <th>P&L</th>
                    <th>Vikt</th>
                    <th>Stop</th>
                    <th>Mål</th>
                    <th>R</th>
                    <th>Spark</th>
                  </tr>
                </thead>
                <tbody>
                  {liveBook.positions.map((position) => (
                    <PositionRow
                      key={position.symbol}
                      active={position.symbol === selected?.symbol}
                      book={liveBook}
                      candles={liveCharts[position.symbol] ?? []}
                      marketUsd={stats.marketUsd}
                      position={position}
                      quotes={quotes}
                      onClick={() => setSymbol((current) => (current === position.symbol ? null : position.symbol))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {selected && selectedMetrics ? (
            <section className="ac-section-block" ref={chartRef} aria-labelledby="name-chart-heading">
              <h2 className="ac-visually-hidden" id="name-chart-heading">
                {selected.symbol}
              </h2>
              <PositionChart
                position={selected}
                fillClock={formatBerlinClock(selected.filledAt, liveBook.timezone)}
                candles={liveCharts[selected.symbol] ?? []}
                metrics={selectedMetrics}
                quote={quotes[selected.symbol]}
              />
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function PositionRow({
  position,
  book,
  quotes,
  candles,
  marketUsd,
  active,
  onClick,
}: {
  position: TradingPosition;
  book: TradingBook;
  quotes: TradingLiveSnapshot["quotes"];
  candles: TradingCandle[];
  marketUsd: number;
  active: boolean;
  onClick: () => void;
}) {
  const metrics = getPositionMetrics(position, book, quotes, marketUsd);
  const spark = candles.slice(-24).map((candle) => candle.close);

  return (
    <tr className={active ? "is-active" : ""} onClick={onClick}>
      <td className="trading-blotter__name">
        <strong>{position.symbol}</strong>
        <small>{position.name}</small>
      </td>
      <td>
        {position.shares}
        <small className="trading-blotter__sub">{position.side}</small>
      </td>
      <td>{formatPrice(position.fill)}</td>
      <td>
        {formatPrice(position.last)}
        {metrics.prePct != null ? (
          <small className={`trading-blotter__sub trading-pre ${pnlClass(metrics.prePct)}`}>
            <SunIcon />
            {formatSignedPct(metrics.prePct)}
            {metrics.prePrice != null ? ` · ${formatPrice(metrics.prePrice)}` : ""}
          </small>
        ) : null}
      </td>
      <td className={pnlClass(metrics.dayPct ?? 0)}>
        {metrics.dayPct == null ? "—" : formatSignedPct(metrics.dayPct)}
        <small className={`trading-blotter__sub ${pnlClass(metrics.daySek)}`}>{formatSek(metrics.daySek)}</small>
      </td>
      <td>
        {formatSek(metrics.marketSek)}
        <small className="trading-blotter__sub">{formatCompact(metrics.marketUsd)} USD</small>
      </td>
      <td className={pnlClass(metrics.pnlPct)}>
        {formatSignedPct(metrics.pnlPct)}
        <small className={`trading-blotter__sub ${pnlClass(metrics.pnlSek)}`}>{formatSek(metrics.pnlSek)}</small>
      </td>
      <td>{metrics.weightPct.toFixed(0)}%</td>
      <td>{formatPrice(position.stop)}</td>
      <td>{formatPrice(position.target)}</td>
      <td className={pnlClass(metrics.rMultiple)}>{metrics.rMultiple.toFixed(2)}</td>
      <td>
        <Sparkline positive={metrics.pnlPct >= 0} values={spark} />
      </td>
    </tr>
  );
}

function SunIcon() {
  return (
    <svg className="trading-pre__sun" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
      <path
        d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
