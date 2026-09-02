"use client";

import { useEffect, useRef, useState } from "react";

import {
  ema,
  formatPrice,
  sma,
  type TradingCandle,
  type TradingPosition,
} from "@/lib/trading";

import {
  TRADING_CHART_DOWN,
  TRADING_CHART_EMA,
  TRADING_CHART_POST,
  TRADING_CHART_PRE,
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

type PriceLine = { applyOptions: (options: Record<string, unknown>) => void };
type CandleSeries = {
  setData: (data: TradingCandle[]) => void;
  createPriceLine: (options: Record<string, unknown>) => PriceLine;
  removePriceLine: (line: unknown) => void;
};

function finitePrice(value?: number | null) {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function syncExtendedLines(
  series: CandleSeries,
  dotted: number,
  prePrice: number | null | undefined,
  postPrice: number | null | undefined,
  preLineRef: { current: PriceLine | null },
  postLineRef: { current: PriceLine | null },
) {
  const sync = (
    line: PriceLine | null,
    price: number | null,
    title: string,
    color: string,
    setter: (next: PriceLine | null) => void,
  ) => {
    if (price == null) {
      if (line) {
        series.removePriceLine(line);
        setter(null);
      }
      return;
    }
    if (line) {
      line.applyOptions({ price, title, color });
      return;
    }
    setter(
      series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: dotted,
        axisLabelVisible: true,
        title,
      }),
    );
  };

  sync(preLineRef.current, finitePrice(prePrice), "Pre", TRADING_CHART_PRE, (next) => {
    preLineRef.current = next;
  });
  sync(postLineRef.current, finitePrice(postPrice), "AH", TRADING_CHART_POST, (next) => {
    postLineRef.current = next;
  });
}

export function ChartCanvas({
  candles,
  position,
  fillClock,
  showEma,
  showSma,
  prePrice,
  postPrice,
}: {
  candles: TradingCandle[];
  position: TradingPosition;
  fillClock: string;
  showEma: boolean;
  showSma: boolean;
  prePrice?: number | null;
  postPrice?: number | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const emaRef = useRef<{ applyOptions: (options: { visible: boolean }) => void; setData: (data: Array<{ time: string; value: number }>) => void } | null>(null);
  const smaRef = useRef<{ applyOptions: (options: { visible: boolean }) => void; setData: (data: Array<{ time: string; value: number }>) => void } | null>(null);
  const candleSeriesRef = useRef<{
    setData: (data: TradingCandle[]) => void;
    createPriceLine: (options: Record<string, unknown>) => {
      applyOptions: (options: Record<string, unknown>) => void;
    };
    removePriceLine: (line: unknown) => void;
  } | null>(null);
  const lineStyleRef = useRef<number | null>(null);
  const preLineRef = useRef<{ applyOptions: (options: Record<string, unknown>) => void } | null>(null);
  const postLineRef = useRef<{ applyOptions: (options: Record<string, unknown>) => void } | null>(null);
  const prePriceRef = useRef(prePrice);
  const postPriceRef = useRef(postPrice);
  const candlesRef = useRef(candles);
  prePriceRef.current = prePrice;
  postPriceRef.current = postPrice;
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  candlesRef.current = candles;

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

        const closes = candlesRef.current.map((candle) => candle.close);
        const emaValues = ema(closes, 20);
        const smaValues = sma(closes, 50);

        candleSeries.setData(
          candlesRef.current.map((candle) => ({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        );
        emaSeries.setData(
          candlesRef.current.flatMap((candle, index) => {
            const value = emaValues[index];
            return value == null ? [] : [{ time: candle.time, value }];
          }),
        );
        smaSeries.setData(
          candlesRef.current.flatMap((candle, index) => {
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
        candleSeriesRef.current = candleSeries;
        lineStyleRef.current = LineStyle.Dotted;
        emaRef.current = emaSeries;
        smaRef.current = smaSeries;
        syncExtendedLines(candleSeries, LineStyle.Dotted, prePriceRef.current, postPriceRef.current, preLineRef, postLineRef);

        chart.subscribeCrosshairMove((param: { point?: { x: number; y: number }; time?: unknown }) => {
          if (!param.point || !param.time) {
            setHover(null);
            return;
          }
          const time = typeof param.time === "string" ? param.time : "";
          const current = candlesRef.current;
          const closesNow = current.map((candle) => candle.close);
          const emaNow = ema(closesNow, 20);
          const smaNow = sma(closesNow, 50);
          const index = current.findIndex((candle) => candle.time === time);
          const candle = index >= 0 ? current[index] : null;
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
            ema20: emaNow[index] ?? null,
            sma50: smaNow[index] ?? null,
          });
        });
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Chart failed to render");
      });

    return () => {
      cancelled = true;
      chart?.remove();
      candleSeriesRef.current = null;
      emaRef.current = null;
      smaRef.current = null;
      preLineRef.current = null;
      postLineRef.current = null;
    };
  }, [fillClock, position.fill, position.filledAt, position.stop, position.symbol, position.target]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    const dotted = lineStyleRef.current;
    if (!series || dotted == null) return;
    syncExtendedLines(series, dotted, prePrice, postPrice, preLineRef, postLineRef);
  }, [prePrice, postPrice]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;
    const closes = candles.map((candle) => candle.close);
    const emaValues = ema(closes, 20);
    const smaValues = sma(closes, 50);
    candleSeriesRef.current.setData(candles);
    emaRef.current?.setData(
      candles.flatMap((candle, index) => {
        const value = emaValues[index];
        return value == null ? [] : [{ time: candle.time, value }];
      }),
    );
    smaRef.current?.setData(
      candles.flatMap((candle, index) => {
        const value = smaValues[index];
        return value == null ? [] : [{ time: candle.time, value }];
      }),
    );
  }, [candles]);

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
