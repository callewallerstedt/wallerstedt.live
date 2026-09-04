"use client";

import { formatPrice, type TradingPosition, type TradingPositionMetrics } from "@/lib/trading";

/**
 * The trade drawn on a single linear price rail: stop at the left edge, target at the right,
 * the entry line wherever the fill actually falls between them — rarely the middle. Red is the
 * ground between the entry and the stop, green the ground between the entry and the target,
 * and the pale band is the range today has already travelled.
 */
export function PositionRail({
  metrics,
  position,
}: {
  metrics: TradingPositionMetrics;
  position: TradingPosition;
}) {
  const entry = metrics.fillRailPct;
  const mark = metrics.railPct;
  if (entry == null || mark == null) return null;

  const low = metrics.dayRailLowPct;
  const high = metrics.dayRailHighPct;
  const ranged = low != null && high != null && high - low > 0.15;
  const ahead = metrics.pnlPct >= 0;

  return (
    <div
      className="trading-rail__track"
      role="img"
      aria-label={`${position.symbol}: ${formatPrice(metrics.mark)} mellan stop ${formatPrice(position.stop)} och mål ${formatPrice(position.target)}`}
    >
      <span className="trading-rail__zone trading-rail__zone--stop" style={{ width: `${entry}%` }} />
      <span className="trading-rail__zone trading-rail__zone--target" style={{ left: `${entry}%` }} />
      <span
        className={`trading-rail__span ${ahead ? "is-positive" : "is-negative"}`}
        style={{ left: `${Math.min(entry, mark)}%`, width: `${Math.abs(mark - entry)}%` }}
      />
      {ranged ? (
        <>
          <span className="trading-rail__range" style={{ left: `${low}%`, width: `${high - low}%` }} />
          <span className="trading-rail__edge" style={{ left: `${low}%` }} />
          <span className="trading-rail__edge" style={{ left: `${high}%` }} />
        </>
      ) : null}
      <span className="trading-rail__entry" style={{ left: `${entry}%` }} />
      <span className={`trading-rail__mark ${ahead ? "is-positive" : "is-negative"}`} style={{ left: `${mark}%` }} />
    </div>
  );
}
