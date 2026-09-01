"use client";

import { useEffect, useRef, useState } from "react";

import { ema, formatPrice, sma, type TradingCandle, type TradingPosition } from "@/lib/trading";

import {
  TRADING_CHART_DOWN,
  TRADING_CHART_EMA,
  TRADING_CHART_SMA,
  TRADING_CHART_STOP,
  TRADING_CHART_TARGET,
  TRADING_CHART_UP,
  tradingChartOptions,
} from "./chart-theme";

type HoverPoint = {
  x: number;
  y: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ema20: number | null;
  sma50: number | null;
};

export function ChartCanvas({
  candles,
  position,
  fillClock,
  showEma,
  showSma,
}: {
  candles: TradingCandle[];
  position: TradingPosition;
  fillClock: string;
  showEma: boolean;
  showSma: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const emaRef = useRef<{ applyOptions: (options: { visible: boolean }) => void } | null>(null);
  const smaRef = useRef<{ applyOptions: (options: { visible: boolean }) => void } | null>(null);
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || candles.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;

    import("lightweight-charts")
      .then((charts) => {
        if (cancelled || !hostRef.current) return;
        const { CandlestickSeries, LineSeries, LineStyle, LineType, createChart, createSeriesMarkers } = charts;

        chart = createChart(hostRef.current, {
          ...tradingChartOptions(charts, hostRef.current.clientHeight || 380),
          width: hostRef.current.clientWidth || 640,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: TRADING_CHART_UP,
          downColor: TRADING_CHART_DOWN,
          borderUpColor: TRADING_CHART_UP,
          borderDownColor: TRADING_CHART_DOWN,
          wickUpColor: TRADING_CHART_UP,
          wickDownColor: TRADING_CHART_DOWN,
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: "rgba(255,255,255,0.45)",
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });

        const emaSeries = chart.addSeries(LineSeries, {
          color: TRADING_CHART_EMA,
          lineWidth: 2,
          lineType: LineType.Curved,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          visible: showEma,
        });

        const smaSeries = chart.addSeries(LineSeries, {
          color: TRADING_CHART_SMA,
          lineWidth: 2,
          lineType: LineType.Curved,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          visible: showSma,
        });

        const closes = candles.map((candle) => candle.close);
        const emaValues = ema(closes, 20);
        const smaValues = sma(closes, 50);

        candleSeries.setData(
          candles.map((candle) => ({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        );
        emaSeries.setData(
          candles.flatMap((candle, index) => {
            const value = emaValues[index];
            return value == null ? [] : [{ time: candle.time, value }];
          }),
        );
        smaSeries.setData(
          candles.flatMap((candle, index) => {
            const value = smaValues[index];
            return value == null ? [] : [{ time: candle.time, value }];
          }),
        );

        createSeriesMarkers(candleSeries, [
          {
            time: position.filledAt.slice(0, 10),
            position: "atPriceMiddle",
            shape: "circle",
            color: TRADING_CHART_UP,
            price: position.fill,
            text: `${formatPrice(position.fill)} ${fillClock}`,
            size: 1.4,
          },
        ]);
        candleSeries.createPriceLine({
          price: position.target,
          color: TRADING_CHART_TARGET,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
        candleSeries.createPriceLine({
          price: position.stop,
          color: TRADING_CHART_STOP,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });

        chart.timeScale().fitContent();
        emaRef.current = emaSeries;
        smaRef.current = smaSeries;

        chart.subscribeCrosshairMove((param: { point?: { x: number; y: number }; time?: unknown }) => {
          if (!param.point || !param.time) {
            setHover(null);
            return;
          }
          const time = typeof param.time === "string" ? param.time : "";
          const index = candles.findIndex((candle) => candle.time === time);
          const candle = index >= 0 ? candles[index] : null;
          if (!candle) {
            setHover(null);
            return;
          }
          setHover({
            x: Math.min(param.point.x + 14, hostRef.current!.clientWidth - 168),
            y: Math.max(12, param.point.y - 18),
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            ema20: emaValues[index] ?? null,
            sma50: smaValues[index] ?? null,
          });
        });
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Chart failed to render");
      });

    return () => {
      cancelled = true;
      chart?.remove();
      emaRef.current = null;
      smaRef.current = null;
    };
  }, [candles, fillClock, position.fill, position.filledAt, position.stop, position.target]);

  useEffect(() => {
    emaRef.current?.applyOptions({ visible: showEma });
  }, [showEma]);

  useEffect(() => {
    smaRef.current?.applyOptions({ visible: showSma });
  }, [showSma]);

  return (
    <>
      <div className="trading-chart__canvas" ref={hostRef} />
      {error ? <div className="trading-chart__empty">{error}</div> : null}
      {hover ? (
        <div className="trading-chart__tooltip" style={{ left: hover.x, top: hover.y }}>
          <p>{hover.time}</p>
          <p>O {formatPrice(hover.open)}</p>
          <p>H {formatPrice(hover.high)}</p>
          <p>L {formatPrice(hover.low)}</p>
          <p>C {formatPrice(hover.close)}</p>
          {hover.ema20 != null ? <p style={{ color: TRADING_CHART_EMA }}>EMA20 {formatPrice(hover.ema20)}</p> : null}
          {hover.sma50 != null ? <p style={{ color: TRADING_CHART_SMA }}>SMA50 {formatPrice(hover.sma50)}</p> : null}
        </div>
      ) : null}
    </>
  );
}
