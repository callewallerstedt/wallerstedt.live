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

/** Where the live mark sits between the stop and the target, and what is left either way. */
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

  const toStop = metrics.stopProgressPct ?? 0;
  const toTarget = metrics.targetProgressPct ?? 0;
  const losing = toStop > 0;
  const ahead = metrics.pnlPct >= 0;

  return (
    <div className="trading-progress">
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
        <span className={losing ? "is-negative" : "is-positive"}>
          <strong>{(losing ? toStop : toTarget).toFixed(0)}%</strong> {losing ? "mot stop" : "mot mål"}
        </span>
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
          Till stop{" "}
          <strong>
            {metrics.stopDistPct == null ? "—" : formatSignedPct(metrics.stopDistPct)} ·{" "}
            {formatSek(-metrics.openRiskSek)}
          </strong>
        </span>
        <span>
          Till mål{" "}
          <strong>
            {metrics.targetDistPct == null ? "—" : formatSignedPct(metrics.targetDistPct)} ·{" "}
            {formatSek(metrics.rewardSek)}
          </strong>
        </span>
      </div>
    </div>
  );
}
