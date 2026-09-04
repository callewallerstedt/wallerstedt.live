"use client";

import {
  formatPrice,
  formatRMultiple,
  formatSek,
  formatSignedPct,
  getPositionMetrics,
  type TradingBook,
  type TradingLiveSnapshot,
  type TradingPosition,
} from "@/lib/trading";

import { PositionRail } from "./PositionRail";

function pnlClass(value: number | null | undefined) {
  if (value == null) return "";
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
}

function Row({
  book,
  marketUsd,
  onSelect,
  position,
  quotes,
}: {
  book: TradingBook;
  marketUsd: number;
  onSelect: () => void;
  position: TradingPosition;
  quotes: TradingLiveSnapshot["quotes"];
}) {
  const metrics = getPositionMetrics(position, book, quotes, marketUsd);
  const toStop = metrics.stopProgressPct ?? 0;
  const toTarget = metrics.targetProgressPct ?? 0;
  const losing = toStop > 0;
  const travelled = losing ? toStop : toTarget;
  const hasRail = metrics.railPct != null && metrics.fillRailPct != null;

  return (
    <button className="trading-overview__row" onClick={onSelect} type="button">
      <span className="trading-overview__head">
        <span className="trading-overview__name">
          <strong>{position.symbol}</strong>
          <small>{position.name}</small>
        </span>
        <span className="trading-overview__price">
          <strong className={pnlClass(metrics.pnlPct)}>{formatSignedPct(metrics.pnlPct)}</strong>
          <small>
            {formatPrice(metrics.mark)}
            {metrics.markSession !== "regular" ? (metrics.markSession === "pre" ? " pre" : " ah") : ""} ·{" "}
            <em className={pnlClass(metrics.dayPct)}>
              {metrics.dayPct == null ? "—" : formatSignedPct(metrics.dayPct)} idag
            </em>
          </small>
        </span>
      </span>

      {hasRail ? <PositionRail metrics={metrics} position={position} /> : null}

      <span className="trading-overview__feet">
        <span className="trading-overview__leg trading-overview__leg--stop">
          <em>Stop</em>
          {formatPrice(position.stop)}
          <small>{formatSignedPct(position.stopPct)}</small>
        </span>
        <span className={`trading-overview__state ${losing ? "is-negative" : "is-positive"}`}>
          {hasRail ? `${travelled.toFixed(0)}% ${losing ? "mot stop" : "mot mål"}` : "inget mål satt"}
          <small>
            {formatRMultiple(metrics.rMultiple)}R · {formatSek(metrics.pnlSek)}
          </small>
        </span>
        <span className="trading-overview__leg trading-overview__leg--target">
          <em>Mål</em>
          {formatPrice(position.target)}
          <small>{formatSignedPct(position.targetPct)}</small>
        </span>
      </span>
    </button>
  );
}

/** The landing view: every open name on the same rail, before any one of them is opened. */
export function PositionOverview({
  book,
  marketUsd,
  onSelect,
  quotes,
}: {
  book: TradingBook;
  marketUsd: number;
  onSelect: (symbol: string) => void;
  quotes: TradingLiveSnapshot["quotes"];
}) {
  if (book.positions.length === 0) return null;

  return (
    <div className="trading-overview">
      <div className="trading-overview__legend">
        <span>
          <i className="trading-overview__swatch trading-overview__swatch--stop" />
          Stoploss
        </span>
        <span>
          <i className="trading-overview__swatch trading-overview__swatch--entry" />
          Inköp
        </span>
        <span>
          <i className="trading-overview__swatch trading-overview__swatch--range" />
          Dagens spann
        </span>
        <span>
          <i className="trading-overview__swatch trading-overview__swatch--target" />
          Mål
        </span>
      </div>
      {book.positions.map((position) => (
        <Row
          book={book}
          key={position.symbol}
          marketUsd={marketUsd}
          onSelect={() => onSelect(position.symbol)}
          position={position}
          quotes={quotes}
        />
      ))}
    </div>
  );
}
