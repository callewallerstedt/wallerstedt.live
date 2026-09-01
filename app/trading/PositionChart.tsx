"use client";

import { useEffect, useState } from "react";

import { formatPrice, formatSignedPct, type TradingCandle, type TradingChartFile, type TradingPosition } from "@/lib/trading";

import { ChartCanvas } from "./ChartCanvas";

export function PositionChart({
  position,
  fillClock,
  initialCandles,
}: {
  position: TradingPosition;
  fillClock: string;
  initialCandles: TradingCandle[];
}) {
  const [mounted, setMounted] = useState(false);
  const [candles, setCandles] = useState<TradingCandle[]>(initialCandles);
  const [showEma, setShowEma] = useState(true);
  const [showSma, setShowSma] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(position.chart, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Chart ${response.status}`);
        return response.json() as Promise<TradingChartFile>;
      })
      .then((file) => {
        if (!cancelled && file.candles?.length) setCandles(file.candles);
      })
      .catch((cause) => {
        if (!cancelled && !initialCandles.length) {
          setError(cause instanceof Error ? cause.message : "Chart missing");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialCandles.length, position.chart]);

  const pnlUp = position.pnlPct >= 0;

  return (
    <div className="trading-chart">
      <div className="trading-chart__hud">
        <p className="trading-chart__fill">
          {position.symbol} {position.side} {position.shares}sh fill {formatPrice(position.fill)}
        </p>
        <p className={pnlUp ? "trading-chart__pnl is-up" : "trading-chart__pnl is-down"}>
          P&L {formatSignedPct(position.pnlPct)} last {formatPrice(position.last)}
        </p>
      </div>
      <div className="trading-chart__legend">
        <button type="button" data-line="ema" className={showEma ? "is-on" : ""} onClick={() => setShowEma((value) => !value)}>
          — EMA20
        </button>
        <button type="button" data-line="sma" className={showSma ? "is-on" : ""} onClick={() => setShowSma((value) => !value)}>
          — SMA50
        </button>
      </div>
      {error ? <div className="trading-chart__empty">{error}</div> : null}
      {!mounted || candles.length === 0 ? (
        <div className="trading-chart__loading">{candles.length === 0 ? "No chart data yet." : "Loading chart…"}</div>
      ) : (
        <ChartCanvas candles={candles} position={position} fillClock={fillClock} showEma={showEma} showSma={showSma} />
      )}
    </div>
  );
}
