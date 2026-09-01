type Charts = typeof import("lightweight-charts");

const INK = "#9c9c9c";
const PANE = "#292929";
const CROSS = "rgba(255,255,255,0.18)";
const GRID = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const LABEL = "#303030";

export const TRADING_CHART_UP = "#a4d3b0";
export const TRADING_CHART_DOWN = "#e2a49e";
export const TRADING_CHART_EMA = "#9bbcff";
export const TRADING_CHART_SMA = "#e0bd85";
export const TRADING_CHART_TARGET = "#c4b5fd";
export const TRADING_CHART_STOP = "#e29a9a";

export function tradingChartOptions(charts: Charts, height: number) {
  const { ColorType, CrosshairMode, LineStyle, PriceScaleMode } = charts;

  return {
    autoSize: true,
    height,
    layout: {
      background: { type: ColorType.Solid, color: PANE },
      textColor: INK,
      fontFamily: "var(--font-body), -apple-system, BlinkMacSystemFont, sans-serif",
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: GRID },
      horzLines: { color: GRID },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: CROSS, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: LABEL },
      horzLine: { color: CROSS, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: LABEL },
    },
    rightPriceScale: {
      visible: true,
      borderVisible: true,
      borderColor: BORDER,
      ticksVisible: true,
      entireTextOnly: true,
      minimumWidth: 80,
      mode: PriceScaleMode.Logarithmic,
      scaleMargins: { top: 0.12, bottom: 0.1 },
    },
    timeScale: {
      visible: true,
      borderVisible: true,
      borderColor: BORDER,
      ticksVisible: true,
      minBarSpacing: 3,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true },
    },
    kineticScroll: {
      mouse: true,
      touch: true,
    },
  };
}
