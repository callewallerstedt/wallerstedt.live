"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AccountingIcons as Icon } from "@/components/accounting/AccountingIcons";
import {
  buildEquityCurve,
  formatBerlinClock,
  formatBerlinDateTime,
  formatPrice,
  formatSek,
  formatSignedPct,
  getPortfolioStats,
  getTradingDeskStats,
  portfolioPositions,
  positionPnlSek,
  type TradingBook,
  type TradingCandle,
  type TradingPortfolio,
  type TradingPosition,
} from "@/lib/trading";

import "@/components/accounting/accounting.css";
import "./trading.css";

import { EquityChart } from "./EquityChart";
import { PositionChart } from "./PositionChart";

function homeGreeting() {
  const hour = new Date().getHours();
  if (hour < 10) return "God morgon";
  if (hour < 18) return "Hej";
  return "God kväll";
}

function pnlClass(value: number) {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
}

export function TradingApp({
  book,
  charts,
}: {
  book: TradingBook;
  charts: Record<string, TradingCandle[]>;
}) {
  const [mounted, setMounted] = useState(false);
  const [portfolioId, setPortfolioId] = useState(book.portfolios[0]?.id ?? "");
  const [symbol, setSymbol] = useState<string | null>(null);
  const chartRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stats = useMemo(() => getTradingDeskStats(book), [book]);
  const selectedPortfolio = book.portfolios.find((item) => item.id === portfolioId) ?? book.portfolios[0] ?? null;
  const held = selectedPortfolio ? portfolioPositions(book, selectedPortfolio) : book.positions;
  const selectedPosition = held.find((position) => position.symbol === symbol) ?? null;
  const equityPoints = useMemo(() => buildEquityCurve(book, charts), [book, charts]);
  const equityChangePct = book.experiment.capitalSek
    ? (stats.openPnlSek / book.experiment.capitalSek) * 100
    : 0;

  useEffect(() => {
    if (!selectedPosition) return;
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedPosition]);

  return (
    <main className="accounting-app ac-shell trading-app">
      <header className="ac-topbar">
        <div className="ac-topbar-inner">
          <div className="ac-brand-lockup">
            <span className="ac-logo" aria-hidden="true">
              W
            </span>
            <div>
              <span className="ac-brand-name">Wallerstedt</span>
              <span className="ac-brand-subtitle">Trading</span>
            </div>
          </div>
          <div className="ac-topbar-actions">
            <span className="ac-online-pill is-online" role="status">
              Privat
            </span>
          </div>
        </div>
      </header>

      <div className="ac-page-wrap">
        <div className="ac-view">
          <header className="ac-home-greeting">
            <p className="ac-eyebrow">Wallerstedt Productions AB</p>
            <h1>
              {mounted ? homeGreeting() : "Hej"} Calle
            </h1>
          </header>

          <section className="ac-hero-card" aria-labelledby="equity-heading">
            <div className="ac-hero-main">
              <span id="equity-heading">Total utveckling</span>
              <strong className={pnlClass(stats.openPnlSek)}>{formatSek(stats.equitySek)}</strong>
              <small>
                {formatSignedPct(equityChangePct)} · {stats.openPnlSek >= 0 ? "+" : ""}
                {formatSek(stats.openPnlSek)} orealiserat
                {book.updatedAt ? ` · senast ${formatBerlinDateTime(book.updatedAt, book.timezone)}` : ""}
              </small>
            </div>
            {mounted ? <EquityChart points={equityPoints} /> : <div className="trading-chart__loading">Laddar graf…</div>}
            <div className="ac-hero-row">
              <div>
                <span>Kapital</span>
                <strong>{formatSek(book.experiment.capitalSek)}</strong>
                <small>Tak för boken</small>
              </div>
              <div>
                <span>Notional</span>
                <strong>{formatSek(stats.notionalSek)}</strong>
                <small>{stats.namesHeld.length} öppna namn</small>
              </div>
            </div>
          </section>

          <section className="ac-section-block" aria-labelledby="portfolio-heading">
            <div className="ac-section-heading-row">
              <h2 id="portfolio-heading">Portföljer</h2>
              <span className="ac-count-badge">{book.portfolios.length}</span>
            </div>
            <div className="ac-entry-list">
              {book.portfolios.map((portfolio) => (
                <PortfolioRow
                  key={portfolio.id}
                  active={portfolio.id === selectedPortfolio?.id}
                  book={book}
                  portfolio={portfolio}
                  onClick={() => {
                    setPortfolioId(portfolio.id);
                    setSymbol(null);
                  }}
                />
              ))}
            </div>
          </section>

          {selectedPortfolio ? (
            <section className="ac-section-block" aria-labelledby="positions-heading">
              <div className="ac-section-heading-row">
                <h2 id="positions-heading">{selectedPortfolio.name}</h2>
                <span className="ac-count-badge">{held.length}</span>
              </div>
              <div className="ac-entry-list">
                {held.map((position) => (
                  <PositionRow
                    key={position.symbol}
                    active={position.symbol === selectedPosition?.symbol}
                    book={book}
                    position={position}
                    onClick={() => setSymbol((current) => (current === position.symbol ? null : position.symbol))}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {selectedPosition ? (
            <section className="ac-section-block" ref={chartRef} aria-labelledby="name-chart-heading">
              <div className="ac-section-heading-row">
                <h2 id="name-chart-heading">{selectedPosition.symbol}</h2>
              </div>
              <PositionChart
                position={selectedPosition}
                fillClock={formatBerlinClock(selectedPosition.filledAt, book.timezone)}
                candles={charts[selectedPosition.symbol] ?? []}
              />
            </section>
          ) : (
            <p className="trading-empty-hint">Välj ett namn i portföljen för graf, stop och target.</p>
          )}

          <section className="trading-rules" aria-label="Regler">
            {book.experiment.rules.map((rule) => (
              <span key={rule}>{rule}</span>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}

function PortfolioRow({
  portfolio,
  book,
  active,
  onClick,
}: {
  portfolio: TradingPortfolio;
  book: TradingBook;
  active: boolean;
  onClick: () => void;
}) {
  const stats = getPortfolioStats(book, portfolio);

  return (
    <button
      aria-pressed={active}
      className={`ac-entry-row ${active ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="ac-entry-avatar">{portfolio.name.slice(0, 1)}</span>
      <span className="ac-entry-copy">
        <strong>{portfolio.name}</strong>
        <small>
          {portfolio.style} · {stats.namesHeld.length} namn · {formatSek(portfolio.capitalSek)} cap
        </small>
      </span>
      <span className="ac-entry-amount">
        <strong className={pnlClass(stats.openPnlSek)}>{formatSek(stats.openPnlSek)}</strong>
        <Icon.Chevron size={18} />
      </span>
    </button>
  );
}

function PositionRow({
  position,
  book,
  active,
  onClick,
}: {
  position: TradingPosition;
  book: TradingBook;
  active: boolean;
  onClick: () => void;
}) {
  const pnlSek = positionPnlSek(position, book.fxUsdSek);

  return (
    <button
      aria-pressed={active}
      className={`ac-entry-row ${active ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className={`ac-entry-avatar ${position.pnlPct >= 0 ? "is-income" : "is-expense"}`}>{position.symbol}</span>
      <span className="ac-entry-copy">
        <strong>
          {position.symbol} {position.side} {position.shares}sh
        </strong>
        <small>
          {position.name} · fill {formatPrice(position.fill)} · last {formatPrice(position.last)}
        </small>
      </span>
      <span className="ac-entry-amount">
        <span>
          <strong className={pnlClass(position.pnlPct)}>{formatSignedPct(position.pnlPct)}</strong>
          <small className={pnlClass(pnlSek)}>{formatSek(pnlSek)}</small>
        </span>
        <Icon.Chevron size={18} />
      </span>
    </button>
  );
}
