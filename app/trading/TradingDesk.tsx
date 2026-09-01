"use client";

import { useEffect, useMemo, useState } from "react";

import {
  formatBerlinClock,
  formatPrice,
  formatSignedNumber,
  formatSignedPct,
  getTradingBookUrl,
  getTradingDeskStats,
  parseTradingBook,
  type TradingBook,
  type TradingPosition,
} from "@/lib/trading";

import { PositionChart } from "./PositionChart";

function pnlClass(value: number) {
  if (value > 0) return "is-up";
  if (value < 0) return "is-down";
  return "";
}

function PositionMeta({ position }: { position: TradingPosition }) {
  return (
    <div className="trading-position__meta">
      <p>
        <span>Position</span>
        <strong className="trading-position__title">
          {position.symbol} {position.side} {position.shares}sh
        </strong>
      </p>
      <p>
        <span>Fill</span>
        <strong>{formatPrice(position.fill)}</strong>
      </p>
      <p>
        <span>Last</span>
        <strong>{formatPrice(position.last)}</strong>
      </p>
      <p>
        <span>Stop / target</span>
        <strong>
          {formatPrice(position.stop)} · {formatPrice(position.target)}
        </strong>
      </p>
      <p>
        <span>P&L</span>
        <strong className={`trading-position__pnl ${pnlClass(position.pnlPct)}`}>{formatSignedPct(position.pnlPct)}</strong>
      </p>
    </div>
  );
}

export function TradingDesk({ initialBook }: { initialBook: TradingBook }) {
  const [book, setBook] = useState(initialBook);

  useEffect(() => {
    let cancelled = false;
    const url = getTradingBookUrl();

    fetch(url, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setBook(parseTradingBook(payload));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => getTradingDeskStats(book), [book]);
  const held = stats.namesHeld.length ? stats.namesHeld.join(" · ") : "None";
  const winLoss =
    stats.wins == null && stats.losses == null ? "Later" : `${stats.wins ?? 0}–${stats.losses ?? 0}`;

  return (
    <>
      <section className="trading-stats" aria-label="Live book stats">
        <article className={`trading-stat ${stats.openPnlSek >= 0 ? "trading-stat--up" : "trading-stat--down"}`}>
          <span>Open P&L</span>
          <strong>{formatSignedNumber(stats.openPnlSek, 0, " SEK")}</strong>
        </article>
        <article className="trading-stat">
          <span>Notional</span>
          <strong>{Math.round(stats.notionalSek).toLocaleString("en-GB")} SEK</strong>
        </article>
        <article className="trading-stat">
          <span>Names held</span>
          <strong>{held}</strong>
        </article>
        <article className="trading-stat">
          <span>Win / loss</span>
          <strong>{winLoss}</strong>
        </article>
      </section>

      <aside className="trading-rules" aria-label="Experiment rules">
        {book.experiment.rules.map((rule) => (
          <p key={rule}>
            <strong>{rule}</strong>
          </p>
        ))}
      </aside>

      <section className="trading-positions" aria-label="Open positions">
        {book.positions.map((position) => (
          <article className="trading-position" key={position.symbol}>
            <PositionMeta position={position} />
            <PositionChart position={position} fillClock={formatBerlinClock(position.filledAt, book.timezone)} />
          </article>
        ))}
      </section>
    </>
  );
}
