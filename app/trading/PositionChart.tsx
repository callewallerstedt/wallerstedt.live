"use client";

import { useEffect, useState } from "react";

import { formatPrice, formatSignedPct, type TradingCandle, type TradingPosition } from "@/lib/trading";

import { ChartCanvas } from "./ChartCanvas";

export function PositionChart({
  position,
  fillClock,
  candles,
}: {
  position: TradingPosition;
  fillClock: string;
  candles: TradingCandle[];
}) {
  const [mounted, setMounted] = useState(false);
  const [showEma, setShowEma] = useState(true);
  const [showSma, setShowSma] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pnlUp = position.pnlPct >= 0;

  return (
    <div className="trading-chart">
      <div className="trading-chart__head">
        <div className="ac-hero-main">
          <span>
            {position.symbol} {position.side} {position.shares}sh
          </span>
          <strong className={pnlUp ? "is-positive" : "is-negative"}>
            P&L {formatSignedPct(position.pnlPct)}
          </strong>
          <small>
            fill {formatPrice(position.fill)} · last {formatPrice(position.last)}
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
      <div className="ac-hero-row">
        <div>
          <span>Target</span>
          <strong>{formatPrice(position.target)}</strong>
          <small>
            {position.targetPct > 0 ? "+" : "−"}
            {Math.abs(position.targetPct).toFixed(1)}%
          </small>
        </div>
        <div>
          <span>Stop</span>
          <strong>{formatPrice(position.stop)}</strong>
          <small>
            {position.stopPct > 0 ? "+" : "−"}
            {Math.abs(position.stopPct).toFixed(1)}%
          </small>
        </div>
      </div>
      <p className="trading-chart__hint">Loggskala. Zooma med hjulet. Dra i siffrorna till höger och nederst. Dubbelklick nollställer.</p>
    </div>
  );
}
