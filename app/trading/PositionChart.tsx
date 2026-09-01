"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import {
  ema,
  formatPrice,
  formatSignedPct,
  sma,
  type TradingCandle,
  type TradingChartFile,
  type TradingPosition,
} from "@/lib/trading";

type Props = {
  position: TradingPosition;
  fillClock: string;
};

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

function asTime(value: string): UTCTimestamp | string {
  return value;
}

export function PositionChart({ position, fillClock }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const smaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const targetLineRef = useRef<IPriceLine | null>(null);
  const stopLineRef = useRef<IPriceLine | null>(null);
  const candlesRef = useRef<TradingCandle[]>([]);
  const emaValuesRef = useRef<Array<number | null>>([]);
  const smaValuesRef = useRef<Array<number | null>>([]);

  const [candles, setCandles] = useState<TradingCandle[] | null>(null);
  const [showEma, setShowEma] = useState(true);
  const [showSma, setShowSma] = useState(true);
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [levels, setLevels] = useState({ targetY: 0, stopY: 0 });

  useEffect(() => {
    let cancelled = false;

    fetch(position.chart, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("chart missing");
        return response.json() as Promise<TradingChartFile>;
      })
      .then((file) => {
        if (!cancelled) setCandles(file.candles ?? []);
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [position.chart]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !candles || candles.length === 0) return;

    const chart = createChart(host, {
      autoSize: true,
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
    });

    const smaSeries = chart.addSeries(LineSeries, {
      color: SMA,
      lineWidth: 2,
      lineType: LineType.Curved,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    const closes = candles.map((candle) => candle.close);
    const emaValues = ema(closes, 20);
    const smaValues = sma(closes, 50);

    candleSeries.setData(
      candles.map((candle) => ({
        time: asTime(candle.time),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );

    emaSeries.setData(
      candles.flatMap((candle, index) => {
        const value = emaValues[index];
        return value == null ? [] : [{ time: asTime(candle.time), value }];
      }),
    );

    smaSeries.setData(
      candles.flatMap((candle, index) => {
        const value = smaValues[index];
        return value == null ? [] : [{ time: asTime(candle.time), value }];
      }),
    );

    const fillDay = position.filledAt.slice(0, 10);
    createSeriesMarkers(candleSeries, [
      {
        time: asTime(fillDay),
        position: "atPriceMiddle",
        shape: "circle",
        color: ENTRY,
        price: position.fill,
        text: `${formatPrice(position.fill)} ${fillClock}`,
        size: 1.4,
      },
    ]);

    const targetLine = candleSeries.createPriceLine({
      price: position.target,
      color: TARGET,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "",
    });

    const stopLine = candleSeries.createPriceLine({
      price: position.stop,
      color: STOP,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "",
    });

    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleRef.current = candleSeries;
    emaRef.current = emaSeries;
    smaRef.current = smaSeries;
    targetLineRef.current = targetLine;
    stopLineRef.current = stopLine;
    candlesRef.current = candles;
    emaValuesRef.current = emaValues;
    smaValuesRef.current = smaValues;

    const syncLevels = () => {
      const targetY = candleSeries.priceToCoordinate(position.target);
      const stopY = candleSeries.priceToCoordinate(position.stop);
      if (targetY == null || stopY == null) return;
      setLevels({ targetY, stopY });
    };

    syncLevels();
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncLevels);
    chart.subscribeCrosshairMove((param) => {
      syncLevels();
      if (!param.point || !param.time || !host) {
        setHover(null);
        return;
      }

      const time = typeof param.time === "string" ? param.time : "";
      const index = candlesRef.current.findIndex((candle) => candle.time === time);
      const candle = index >= 0 ? candlesRef.current[index] : null;
      if (!candle) {
        setHover(null);
        return;
      }

      const width = host.clientWidth;
      setHover({
        x: Math.min(param.point.x + 14, width - 168),
        y: Math.max(12, param.point.y - 18),
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        ema20: emaValuesRef.current[index] ?? null,
        sma50: smaValuesRef.current[index] ?? null,
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
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
      {candles == null ? <div className="trading-chart__loading">Loading chart…</div> : null}
      {candles && candles.length === 0 ? <div className="trading-chart__empty">No chart data yet.</div> : null}
      <div className="trading-chart__canvas" ref={hostRef} />
      {candles && candles.length > 0 ? (
        <div className="trading-chart__levels" aria-hidden="true">
          <span data-kind="target" style={{ top: levels.targetY }}>
            target {formatPrice(position.target)} ({formatSignedPct(position.targetPct)})
          </span>
          <span data-kind="stop" style={{ top: levels.stopY }}>
            stop {formatPrice(position.stop)} ({formatSignedPct(position.stopPct)})
          </span>
        </div>
      ) : null}
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
    </div>
  );
}
