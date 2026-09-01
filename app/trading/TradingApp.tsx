"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyLiveCandles,
  applyLiveQuotes,
  buildEquityCurve,
  formatBerlinClock,
  formatBerlinDateTime,
  formatPrice,
  formatSek,
  formatSignedPct,
  getPositionMetrics,
  getTradingDeskStats,
  stampLiveEquity,
  type TradingBook,
  type TradingCandle,
  type TradingLiveSnapshot,
  type TradingPosition,
} from "@/lib/trading";

import "@/components/accounting/accounting.css";
import "./trading.css";

import { EquityChart } from "./EquityChart";
import { PositionChart } from "./PositionChart";
import { Sparkline } from "./Sparkline";

const POLL_MS = 8000;

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
  const [clock, setClock] = useState("");
  const [symbol, setSymbol] = useState<string | null>(book.positions[0]?.symbol ?? null);
  const chartRef = useRef<HTMLElement>(null);

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
    const pollId = window.setInterval(() => void refreshLive(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refreshLive();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void refreshLive();
    return () => {
      window.clearInterval(clockId);
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshLive]);

  const liveBook = useMemo(() => applyLiveQuotes(book, live), [book, live]);
  const liveCharts = useMemo(() => applyLiveCandles(charts, live, liveBook.timezone), [charts, live, liveBook.timezone]);
  const quotes = live?.quotes ?? {};
  const stats = useMemo(() => getTradingDeskStats(liveBook, quotes), [liveBook, quotes]);
  const equityPoints = useMemo(
    () => stampLiveEquity(buildEquityCurve(liveBook, liveCharts), liveBook, quotes),
    [liveBook, liveCharts, quotes],
  );
  const selected = liveBook.positions.find((position) => position.symbol === symbol) ?? null;
  const selectedMetrics = selected ? getPositionMetrics(selected, liveBook, quotes, stats.marketUsd) : null;
  const liveOn = live?.session === "open" && !live.stale;
  const statusLabel = !live ? "Seed" : liveOn ? "Live" : live.session === "open" ? "Fördröjd" : "Stängt";

  useEffect(() => {
    if (!selected) return;
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected?.symbol]);

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
            <span className={`ac-online-pill ${liveOn ? "is-online" : "is-offline"}`} role="status">
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
                <strong className={pnlClass(stats.openPnlSek)}>{formatSek(stats.equitySek)}</strong>
                <small>
                  {formatSignedPct(stats.openPnlSek / liveBook.experiment.capitalSek * 100)} totalt ·{" "}
                  <span className={pnlClass(stats.dayPnlSek)}>{formatSignedPct((stats.dayPnlSek / liveBook.experiment.capitalSek) * 100)} idag</span>
                  {live?.fetchedAt ? ` · ${formatBerlinDateTime(live.fetchedAt, liveBook.timezone)}` : ""}
                </small>
              </div>
              <div className="trading-hero-fx">
                <span>USD/SEK</span>
                <strong>{formatFx(liveBook.fxUsdSek)}</strong>
              </div>
            </div>
            <EquityChart points={equityPoints} />
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
      <td>{formatPrice(position.last)}</td>
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
