"use client";

import { useEffect, useState } from "react";

import {
  formatPrice,
  formatRMultiple,
  formatSek,
  formatSignedPct,
  type TradingCandle,
  type TradingPosition,
  type TradingPositionMetrics,
  type TradingQuote,
} from "@/lib/trading";

import { ChartCanvas } from "./ChartCanvas";
import { PositionProgress } from "./PositionProgress";
import { TRADING_CHART_POST, TRADING_CHART_PRE } from "./chart-theme";

function pnlClass(value: number | null | undefined) {
  if (value == null) return "";
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
}

export function PositionChart({
  position,
  fillClock,
  candles,
  metrics,
  onClose,
  quote,
}: {
  position: TradingPosition;
  fillClock: string;
  candles: TradingCandle[];
  metrics: TradingPositionMetrics;
  onClose?: () => void;
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
          <strong className={pnlClass(metrics.pnlPct)}>
            {formatSignedPct(metrics.pnlPct)} · {formatPrice(metrics.mark)}
            {metrics.markSession !== "regular" ? (
              <em className="trading-chart__session">{metrics.markSession === "pre" ? "pre" : "efter stängning"}</em>
            ) : null}
          </strong>
          <small>
            fill {formatPrice(position.fill)} {fillClock} · R {formatRMultiple(metrics.rMultiple)}
            {metrics.markSession !== "regular" ? ` · stängning ${formatPrice(quote?.last ?? position.last)}` : ""}
          </small>
        </div>
        <div className="trading-chart__legend">
          {quote?.prePrice != null ? (
            <span className="trading-chart__key" style={{ color: TRADING_CHART_PRE }}>
              Pre {formatPrice(quote.prePrice)}
              {quote.prePct != null ? ` ${formatSignedPct(quote.prePct)}` : ""}
            </span>
          ) : null}
          {quote?.postPrice != null ? (
            <span className="trading-chart__key" style={{ color: TRADING_CHART_POST }}>
              AH {formatPrice(quote.postPrice)}
              {quote.postPct != null ? ` ${formatSignedPct(quote.postPct)}` : ""}
            </span>
          ) : null}
          <button type="button" data-line="ema" className={showEma ? "is-on" : ""} onClick={() => setShowEma((value) => !value)}>
            EMA20
          </button>
          <button type="button" data-line="sma" className={showSma ? "is-on" : ""} onClick={() => setShowSma((value) => !value)}>
            SMA50
          </button>
          {onClose ? (
            <button aria-label="Stäng" className="trading-chart__close" onClick={onClose} type="button">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      <div className="trading-chart__frame">
        {!mounted || candles.length === 0 ? (
          <div className="trading-chart__loading">{candles.length === 0 ? "Ingen graf ännu." : "Laddar graf…"}</div>
        ) : (
          <ChartCanvas
            candles={candles}
            position={position}
            fillClock={fillClock}
            showEma={showEma}
            showSma={showSma}
            prePrice={quote?.prePrice}
            postPrice={quote?.postPrice}
          />
        )}
      </div>
      <PositionProgress metrics={metrics} position={position} />
      <div className="trading-metric-grid">
        <div>
          <span>Värde</span>
          <strong>{formatSek(metrics.marketSek)}</strong>
          <small className={pnlClass(metrics.pnlSek)}>{formatSek(metrics.pnlSek)} orealiserat</small>
        </div>
        <div>
          <span>Idag</span>
          <strong className={pnlClass(metrics.dayPct)}>
            {metrics.dayPct == null ? "—" : formatSignedPct(metrics.dayPct)}
          </strong>
          <small className={pnlClass(metrics.daySek)}>{formatSek(metrics.daySek)}</small>
        </div>
        <div>
          <span>Dagens intervall</span>
          <strong>
            {quote?.dayLow != null && quote?.dayHigh != null
              ? `${formatPrice(quote.dayLow)}–${formatPrice(quote.dayHigh)}`
              : "—"}
          </strong>
          <small>stängning {formatPrice(quote?.last ?? position.last)}</small>
        </div>
        <div>
          <span>52 veckor</span>
          <strong>
            {quote?.week52Low != null && quote?.week52High != null
              ? `${formatPrice(quote.week52Low)}–${formatPrice(quote.week52High)}`
              : "—"}
          </strong>
          <small>
            {quote?.week52High != null && metrics.mark
              ? `${formatSignedPct(((metrics.mark - quote.week52High) / quote.week52High) * 100)} från toppen`
              : "intervall"}
          </small>
        </div>
        {quote?.prePrice != null ? (
          <div>
            <span>Premarket</span>
            <strong>{formatPrice(quote.prePrice)}</strong>
            <small className={pnlClass(quote.prePct)}>
              {quote.prePct != null ? formatSignedPct(quote.prePct) : "premarket"}
            </small>
          </div>
        ) : null}
        {quote?.postPrice != null ? (
          <div>
            <span>Efter stängning</span>
            <strong>{formatPrice(quote.postPrice)}</strong>
            <small className={pnlClass(quote.postPct)}>
              {quote.postPct != null ? formatSignedPct(quote.postPct) : "after hours"}
            </small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
