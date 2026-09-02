"use client";

import { useEffect, useState } from "react";

import {
  formatPrice,
  formatSignedPct,
  type TradingCandle,
  type TradingPosition,
  type TradingPositionMetrics,
  type TradingQuote,
} from "@/lib/trading";

import { ChartCanvas } from "./ChartCanvas";

export function PositionChart({
  position,
  fillClock,
  candles,
  metrics,
  quote,
}: {
  position: TradingPosition;
  fillClock: string;
  candles: TradingCandle[];
  metrics: TradingPositionMetrics;
  quote?: TradingQuote;
}) {
  const [mounted, setMounted] = useState(false);
  const [showEma, setShowEma] = useState(true);
  const [showSma, setShowSma] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="trading-chart">
      <div className="trading-chart__head">
        <div className="ac-hero-main">
          <span>
            {position.symbol} {position.side} {position.shares}sh · {position.name}
          </span>
          <strong className={metrics.pnlPct >= 0 ? "is-positive" : "is-negative"}>
            {formatSignedPct(metrics.pnlPct)} · {formatPrice(position.last)}
          </strong>
          <small>
            fill {formatPrice(position.fill)} {fillClock} · R {metrics.rMultiple.toFixed(2)}
            {metrics.prePct != null
              ? ` · pre ${formatSignedPct(metrics.prePct)}${metrics.prePrice != null ? ` ${formatPrice(metrics.prePrice)}` : ""}`
              : ""}
          </small>
        </div>
        <div className="trading-chart__legend">
          <button type="button" data-line="ema" className={showEma ? "is-on" : ""} onClick={() => setShowEma((value) => !value)}>
            EMA20
          </button>
          <button type="button" data-line="sma" className={showSma ? "is-on" : ""} onClick={() => setShowSma((value) => !value)}>
            SMA50
          </button>
        </div>
      </div>
      <div className="trading-chart__frame">
        {!mounted || candles.length === 0 ? (
          <div className="trading-chart__loading">{candles.length === 0 ? "Ingen graf ännu." : "Laddar graf…"}</div>
        ) : (
          <ChartCanvas candles={candles} position={position} fillClock={fillClock} showEma={showEma} showSma={showSma} />
        )}
      </div>
      <div className="trading-metric-grid">
        <div>
          <span>Mål</span>
          <strong>{formatPrice(position.target)}</strong>
          <small>{formatSignedPct(metrics.targetDistPct)} vs last</small>
        </div>
        <div>
          <span>Stop</span>
          <strong>{formatPrice(position.stop)}</strong>
          <small>{formatSignedPct(metrics.stopDistPct)} vs last</small>
        </div>
        <div>
          <span>Dag</span>
          <strong className={metrics.dayPct != null && metrics.dayPct >= 0 ? "is-positive" : "is-negative"}>
            {metrics.dayPct == null ? "—" : formatSignedPct(metrics.dayPct)}
          </strong>
          <small>
            {quote?.dayLow != null && quote?.dayHigh != null
              ? `${formatPrice(quote.dayLow)}–${formatPrice(quote.dayHigh)}`
              : "range"}
          </small>
        </div>
        <div>
          <span>52v</span>
          <strong>
            {quote?.week52Low != null && quote?.week52High != null
              ? `${formatPrice(quote.week52Low)}`
              : "—"}
          </strong>
          <small>{quote?.week52High != null ? formatPrice(quote.week52High) : "high"}</small>
        </div>
      </div>
    </div>
  );
}
