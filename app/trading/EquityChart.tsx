"use client";

import { useEffect, useRef, useState } from "react";

import { formatSek, type TradingPoint } from "@/lib/trading";

import { TRADING_CHART_DOWN, TRADING_CHART_UP, tradingChartOptions } from "./chart-theme";

export function EquityChart({ points }: { points: TradingPoint[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; time: string; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || points.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;

    import("lightweight-charts")
      .then((charts) => {
        if (cancelled || !hostRef.current) return;
        const { AreaSeries, createChart } = charts;
        const up = points.at(-1)!.value >= (points[0]?.value ?? 0);

        chart = createChart(hostRef.current, {
          ...tradingChartOptions(charts, hostRef.current.clientHeight || 220),
          width: hostRef.current.clientWidth || 640,
        });

        const series = chart.addSeries(AreaSeries, {
          lineColor: up ? TRADING_CHART_UP : TRADING_CHART_DOWN,
          topColor: up ? "rgba(164, 211, 176, 0.28)" : "rgba(226, 164, 158, 0.28)",
          bottomColor: "rgba(31, 31, 31, 0)",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: "price", precision: 0, minMove: 1 },
        });
        series.setData(points);
        chart.timeScale().fitContent();

        chart.subscribeCrosshairMove((param: { point?: { x: number; y: number }; time?: unknown }) => {
          if (!param.point || !param.time) {
            setHover(null);
            return;
          }
          const time = typeof param.time === "string" ? param.time : "";
          const point = points.find((item) => item.time === time);
          if (!point) {
            setHover(null);
            return;
          }
          setHover({
            x: Math.min(param.point.x + 12, hostRef.current!.clientWidth - 140),
            y: Math.max(8, param.point.y - 16),
            time,
            value: point.value,
          });
        });
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Chart failed");
      });

    return () => {
      cancelled = true;
      chart?.remove();
    };
  }, [points]);

  return (
    <div className="trading-equity-chart">
      <div className="trading-chart__canvas trading-chart__canvas--equity" ref={hostRef} />
      {error ? <div className="trading-chart__empty">{error}</div> : null}
      {hover ? (
        <div className="trading-chart__tooltip" style={{ left: hover.x, top: hover.y }}>
          <p>{hover.time}</p>
          <p>{formatSek(hover.value)}</p>
        </div>
      ) : null}
    </div>
  );
}
