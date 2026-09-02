"use client";

import { useEffect, useRef, useState } from "react";

import {
  formatSek,
  formatSignedPct,
  rebaseToPercent,
  toPercentSeries,
  type TradingPoint,
} from "@/lib/trading";

import { TRADING_CHART_DOWN, TRADING_CHART_UP, tradingChartOptions } from "./chart-theme";

export type EquityOverlay = {
  id: string;
  label: string;
  color: string;
  points: TradingPoint[];
};

type HoverPoint = {
  x: number;
  y: number;
  time: string;
  value: number;
  overlays: Array<{ label: string; color: string; value: number }>;
};

function valueOnOrBefore(points: TradingPoint[], time: string) {
  const exact = points.find((point) => point.time === time);
  if (exact) return exact.value;
  return [...points].reverse().find((point) => point.time <= time)?.value;
}

function chartPoints(unit: "sek" | "pct", equity: TradingPoint[], overlay?: EquityOverlay) {
  if (unit !== "pct") return overlay ? [] : equity;
  const start = equity[0]?.time;
  if (overlay) return start ? rebaseToPercent(overlay.points, start) : [];
  return toPercentSeries(equity);
}

export function EquityChart({
  points,
  unit = "sek",
  overlays = [],
}: {
  points: TradingPoint[];
  unit?: "sek" | "pct";
  overlays?: EquityOverlay[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef(points);
  const overlaysRef = useRef(overlays);
  const unitRef = useRef(unit);
  const seriesRef = useRef<{
    setData: (data: TradingPoint[]) => void;
    applyOptions: (options: Record<string, string>) => void;
  } | null>(null);
  const overlaySeriesRef = useRef<Array<{ id: string; setData: (data: TradingPoint[]) => void }>>([]);
  const overlayKey = overlays.map((overlay) => overlay.id).join(",");
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  pointsRef.current = points;
  overlaysRef.current = overlays;
  unitRef.current = unit;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || pointsRef.current.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;

    import("lightweight-charts")
      .then((charts) => {
        if (cancelled || !hostRef.current) return;
        const { AreaSeries, LineSeries, createChart } = charts;
        const seed = pointsRef.current;
        const percent = unitRef.current === "pct";
        const areaData = chartPoints(unitRef.current, seed);
        const up = (areaData.at(-1)?.value ?? 0) >= (areaData[0]?.value ?? 0);
        const priceFormat = percent
          ? {
              type: "custom" as const,
              minMove: 0.01,
              formatter: (value: number) => `${value.toFixed(1)}%`,
            }
          : { type: "price" as const, precision: 0, minMove: 1 };

        chart = createChart(hostRef.current, {
          ...tradingChartOptions(charts, hostRef.current.clientHeight || 148, percent ? "linear" : "log"),
          width: hostRef.current.clientWidth || 640,
        });

        const series = chart.addSeries(AreaSeries, {
          lineColor: up ? TRADING_CHART_UP : TRADING_CHART_DOWN,
          topColor: up ? "rgba(164, 211, 176, 0.28)" : "rgba(226, 164, 158, 0.28)",
          bottomColor: "rgba(31, 31, 31, 0)",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat,
        });
        series.setData(areaData);
        seriesRef.current = series;

        overlaySeriesRef.current = overlaysRef.current.map((overlay) => {
          const line = chart.addSeries(LineSeries, {
            color: overlay.color,
            lineWidth: 2,
            lastValueVisible: true,
            priceLineVisible: false,
            crosshairMarkerVisible: true,
            priceFormat,
          });
          line.setData(chartPoints(unitRef.current, seed, overlay));
          return { id: overlay.id, setData: (data: TradingPoint[]) => line.setData(data) };
        });

        chart.timeScale().fitContent();

        chart.subscribeCrosshairMove((param: { point?: { x: number; y: number }; time?: unknown }) => {
          if (!param.point || !param.time) {
            setHover(null);
            return;
          }
          const time = typeof param.time === "string" ? param.time : "";
          const equity = chartPoints(unitRef.current, pointsRef.current);
          const value = valueOnOrBefore(equity, time);
          if (value == null) {
            setHover(null);
            return;
          }
          setHover({
            x: Math.min(param.point.x + 12, hostRef.current!.clientWidth - 148),
            y: Math.max(8, param.point.y - 16),
            time,
            value,
            overlays: overlaysRef.current.flatMap((overlay) => {
              const overlayValue = valueOnOrBefore(chartPoints(unitRef.current, pointsRef.current, overlay), time);
              return overlayValue == null ? [] : [{ label: overlay.label, color: overlay.color, value: overlayValue }];
            }),
          });
        });
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Chart failed");
      });

    return () => {
      cancelled = true;
      chart?.remove();
      seriesRef.current = null;
      overlaySeriesRef.current = [];
    };
  }, [overlayKey, unit]);

  useEffect(() => {
    if (!seriesRef.current || points.length === 0) return;
    const areaData = chartPoints(unit, points);
    const up = (areaData.at(-1)?.value ?? 0) >= (areaData[0]?.value ?? 0);
    seriesRef.current.setData(areaData);
    seriesRef.current.applyOptions({
      lineColor: up ? TRADING_CHART_UP : TRADING_CHART_DOWN,
      topColor: up ? "rgba(164, 211, 176, 0.28)" : "rgba(226, 164, 158, 0.28)",
    });
    for (const line of overlaySeriesRef.current) {
      const overlay = overlays.find((item) => item.id === line.id);
      if (overlay) line.setData(chartPoints(unit, points, overlay));
    }
  }, [overlays, points, unit]);

  const formatValue = (value: number) => (unit === "pct" ? formatSignedPct(value) : formatSek(value));

  return (
    <div className="trading-equity-chart">
      <div className="trading-chart__canvas trading-chart__canvas--equity" ref={hostRef} />
      {error ? <div className="trading-chart__empty">{error}</div> : null}
      {hover ? (
        <div className="trading-chart__tooltip" style={{ left: hover.x, top: hover.y }}>
          <p>{hover.time}</p>
          <p>Portfölj {formatValue(hover.value)}</p>
          {hover.overlays.map((overlay) => (
            <p key={overlay.label} style={{ color: overlay.color }}>
              {overlay.label} {formatValue(overlay.value)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
