"use client";

import {
  formatPrice,
  formatRMultiple,
  formatSek,
  formatSignedPct,
  type TradingPosition,
  type TradingPositionMetrics,
} from "@/lib/trading";

import { PositionRail } from "./PositionRail";

const RADIUS = 32;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({
  detail,
  percent,
  price,
  reached,
  title,
  tone,
}: {
  detail: string;
  percent: number;
  price: number;
  reached: boolean;
  title: string;
  tone: "target" | "stop";
}) {
  const value = Math.min(Math.max(percent, 0), 100);
  const dash = (value / 100) * CIRCUMFERENCE;

  return (
    <div className={`trading-ring trading-ring--${tone}${reached ? " is-reached" : ""}`}>
      <div className="trading-ring__dial" role="img" aria-label={`${title}: ${value.toFixed(0)} procent`}>
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle className="trading-ring__track" cx="40" cy="40" r={RADIUS} />
          <circle
            className="trading-ring__value"
            cx="40"
            cy="40"
            r={RADIUS}
            strokeDasharray={`${dash.toFixed(2)} ${(CIRCUMFERENCE - dash).toFixed(2)}`}
          />
        </svg>
        <strong>{value.toFixed(0)}%</strong>
      </div>
      <span className="trading-ring__title">{title}</span>
      <strong className="trading-ring__price">{formatPrice(price)}</strong>
      <small>{detail}</small>
    </div>
  );
}

/**
 * How far the trade has travelled from the fill toward its target and toward its stop,
 * plus where the live mark sits on the stop→target rail.
 */
export function PositionProgress({
  metrics,
  position,
}: {
  metrics: TradingPositionMetrics;
  position: TradingPosition;
}) {
  const hasTarget = position.target > 0 && metrics.targetProgressPct != null;
  const hasStop = position.stop > 0 && metrics.stopProgressPct != null;
  if (!hasTarget && !hasStop) return null;

  const targetPct = metrics.targetProgressPct ?? 0;
  const stopPct = metrics.stopProgressPct ?? 0;
  const ahead = metrics.pnlPct >= 0;

  return (
    <div className="trading-progress">
      <div className="trading-progress__rings">
        {hasTarget ? (
          <Ring
            detail={
              metrics.targetDistPct != null
                ? `${formatSignedPct(metrics.targetDistPct)} kvar · ${formatSek(metrics.rewardSek)}`
                : "mål"
            }
            percent={targetPct}
            price={position.target}
            reached={targetPct >= 100}
            title={targetPct >= 100 ? "Mål nått" : "Mot mål"}
            tone="target"
          />
        ) : null}
        {hasStop ? (
          <Ring
            detail={
              metrics.stopDistPct != null
                ? `${formatSignedPct(metrics.stopDistPct)} kvar · ${formatSek(-metrics.openRiskSek)}`
                : "stop"
            }
            percent={stopPct}
            price={position.stop}
            reached={stopPct >= 100}
            title={stopPct >= 100 ? "Stop träffad" : "Mot stop"}
            tone="stop"
          />
        ) : null}
      </div>

      <div className="trading-rail">
        <PositionRail metrics={metrics} position={position} />
        <div className="trading-rail__ends">
          <span className="trading-rail__end trading-rail__end--stop">
            <em>Stop</em>
            {formatPrice(position.stop)}
            <small>{formatSignedPct(position.stopPct)} vs inköp</small>
          </span>
          <span className="trading-rail__end trading-rail__end--now">
            <em>{metrics.markSession === "pre" ? "Pre" : metrics.markSession === "post" ? "AH" : "Nu"}</em>
            {formatPrice(metrics.mark)}
            <small className={ahead ? "is-positive" : "is-negative"}>{formatSignedPct(metrics.pnlPct)} vs inköp</small>
          </span>
          <span className="trading-rail__end trading-rail__end--target">
            <em>Mål</em>
            {formatPrice(position.target)}
            <small>{formatSignedPct(position.targetPct)} vs inköp</small>
          </span>
        </div>
      </div>

      <div className="trading-progress__foot">
        <span>
          R nu{" "}
          <strong className={metrics.rMultiple >= 0 ? "is-positive" : "is-negative"}>
            {formatRMultiple(metrics.rMultiple)}R
          </strong>
        </span>
        {metrics.plannedR != null ? (
          <span>
            Plan <strong>{metrics.plannedR.toFixed(2)}R</strong>
          </span>
        ) : null}
        <span>
          Risk kvar <strong>{formatSek(-metrics.openRiskSek)}</strong>
        </span>
        <span>
          Kvar till mål <strong>{formatSek(metrics.rewardSek)}</strong>
        </span>
      </div>
    </div>
  );
}
