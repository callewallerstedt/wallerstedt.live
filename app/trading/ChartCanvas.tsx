"use client";

import { useEffect, useRef, useState } from "react";

import { ema, formatPrice, sma, type TradingCandle, type TradingPosition } from "@/lib/trading";

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

const UP = "#26d07c";
const DOWN = "#e23b3b";
const EMA = "#4a90e2";
const SMA = "#f5a623";
const TARGET = "#c084fc";
const STOP = "#ef4444";
const ENTRY = "#3ee6a0";

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
  const [levels, setLevels] = useState({ targetY: 0, stopY: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || candles.length === 0) return;
    let cancelled = false;
    // lightweight-charts is imported only in the browser.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;

    import("lightweight-charts")
      .then((charts) => {
        if (cancelled || !hostRef.current) return;
        const {
          CandlestickSeries,
          ColorType,
          CrosshairMode,
          LineSeries,
          LineStyle,
          LineType,
          createChart,
          createSeriesMarkers,
        } = charts;

        chart = createChart(hostRef.current, {
          autoSize: true,
          width: hostRef.current.clientWidth || 640,
          height: hostRef.current.clientHeight || 420,
          layout: {
            background: { type: ColorType.Solid, color: "#161921" },
            textColor: "#c5c8ce",
            fontFamily: "var(--font-body), Inter, sans-serif",
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.045)" },
            horzLines: { color: "rgba(255,255,255,0.045)" },
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: "rgba(255,255,255,0.22)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a2f38" },
            horzLine: { color: "rgba(255,255,255,0.22)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a2f38" },
          },
          rightPriceScale: {
            borderColor: "rgba(255,255,255,0.08)",
            scaleMargins: { top: 0.12, bottom: 0.08 },
          },
          timeScale: {
            borderColor: "rgba(255,255,255,0.08)",
            minBarSpacing: 4,
          },
          handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
          handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: UP,
          downColor: DOWN,
          borderUpColor: UP,
          borderDownColor: DOWN,
          wickUpColor: UP,
          wickDownColor: DOWN,
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: "rgba(255,255,255,0.55)",
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        });

        const emaSeries = chart.addSeries(LineSeries, {
          color: EMA,
          lineWidth: 2,
          lineType: LineType.Curved,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          visible: showEma,
        });

        const smaSeries = chart.addSeries(LineSeries, {
          color: SMA,
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
            color: ENTRY,
            price: position.fill,
            text: `${formatPrice(position.fill)} ${fillClock}`,
            size: 1.4,
          },
        ]);
        candleSeries.createPriceLine({
          price: position.target,
          color: TARGET,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
        candleSeries.createPriceLine({
          price: position.stop,
          color: STOP,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });

        chart.timeScale().fitContent();
        emaRef.current = emaSeries;
        smaRef.current = smaSeries;

        const syncLevels = () => {
          const targetY = candleSeries.priceToCoordinate(position.target);
          const stopY = candleSeries.priceToCoordinate(position.stop);
          if (targetY == null || stopY == null) return;
          setLevels({ targetY, stopY });
        };

        syncLevels();
        chart.timeScale().subscribeVisibleLogicalRangeChange(syncLevels);
        chart.subscribeCrosshairMove((param: { point?: { x: number; y: number }; time?: unknown }) => {
          syncLevels();
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
      <div className="trading-chart__levels" aria-hidden="true">
        <span data-kind="target" style={{ top: levels.targetY }}>
          target {formatPrice(position.target)} ({position.targetPct > 0 ? "+" : "−"}
          {Math.abs(position.targetPct).toFixed(1)}%)
        </span>
        <span data-kind="stop" style={{ top: levels.stopY }}>
          stop {formatPrice(position.stop)} ({position.stopPct > 0 ? "+" : "−"}
          {Math.abs(position.stopPct).toFixed(1)}%)
        </span>
      </div>
      {hover ? (
        <div className="trading-chart__tooltip" style={{ left: hover.x, top: hover.y }}>
          <p>{hover.time}</p>
          <p>O {formatPrice(hover.open)}</p>
          <p>H {formatPrice(hover.high)}</p>
          <p>L {formatPrice(hover.low)}</p>
          <p>C {formatPrice(hover.close)}</p>
          {hover.ema20 != null ? <p style={{ color: EMA }}>EMA20 {formatPrice(hover.ema20)}</p> : null}
          {hover.sma50 != null ? <p style={{ color: SMA }}>SMA50 {formatPrice(hover.sma50)}</p> : null}
        </div>
      ) : null}
    </>
  );
}
