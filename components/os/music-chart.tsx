"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Charts are drawn in real pixels, so they need the width the box actually got. */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((current) => (Math.abs(current - next) > 0.5 ? next : current));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Written out rather than taken from `Intl` compact notation: Node and Chrome
 * disagree on the case of the suffix, which is enough to fail hydration.
 */
export function briefNumber(value: number) {
  const abs = Math.abs(value);
  const scale = (divisor: number, suffix: string) => {
    const scaled = value / divisor;
    const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 1;
    return `${Number(scaled.toFixed(digits))}${suffix}`;
  };
  if (abs >= 1_000_000) return scale(1_000_000, "M");
  if (abs >= 1_000) return scale(1_000, "K");
  return String(Math.round(value));
}

/**
 * One chart for every time series on the page: line, filled area or column,
 * stacked or overlaid. Pressing anywhere on the plot drags a crosshair through
 * the data and reports the index upwards, so the readout can sit above the
 * plot where a thumb never covers it.
 */
export function MusicChart({
  dates,
  series,
  type = "line",
  stacked = false,
  height = 200,
  active,
  onActive,
  formatX,
  formatY = briefNumber,
  yMax,
  dimFrom,
  className,
}: {
  dates: string[];
  series: ChartSeries[];
  type?: "line" | "area" | "bar";
  stacked?: boolean;
  height?: number;
  active: number | null;
  onActive: (index: number | null) => void;
  formatX: (ymd: string, index: number) => string;
  /** Pin the top of the scale — a percentage chart always reads 0 to 100. */
  formatY?: (value: number) => string;
  yMax?: number;
  /** Draw everything from this index on faded: real numbers, not final ones. */
  dimFrom?: number;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const count = dates.length;
  const pad = { l: 34, r: 8, t: 10, b: 18 };
  const innerW = Math.max(1, width - pad.l - pad.r);
  const innerH = Math.max(1, height - pad.t - pad.b);

  const { max, stacks } = useMemo(() => {
    const totals = new Array<number>(count).fill(0);
    const layers: number[][] = [];
    if (stacked) {
      const running = new Array<number>(count).fill(0);
      for (const item of series) {
        const base = running.slice();
        for (let index = 0; index < count; index += 1) running[index] += item.values[index] ?? 0;
        layers.push(base);
      }
      for (let index = 0; index < count; index += 1) totals[index] = running[index];
    } else {
      for (const item of series) {
        for (let index = 0; index < count; index += 1) {
          totals[index] = Math.max(totals[index], item.values[index] ?? 0);
        }
      }
    }
    return { max: yMax ?? niceCeiling(Math.max(...totals, 1)), stacks: layers };
  }, [series, stacked, count, yMax]);

  const xAt = useCallback(
    (index: number) => {
      if (count <= 1) return pad.l + innerW / 2;
      if (type === "bar") return pad.l + ((index + 0.5) / count) * innerW;
      return pad.l + (index / (count - 1)) * innerW;
    },
    [count, innerW, pad.l, type],
  );
  const yAt = useCallback(
    (value: number) => pad.t + innerH - (value / max) * innerH,
    [innerH, max, pad.t],
  );

  const pick = useCallback(
    (clientX: number) => {
      const node = svgRef.current;
      if (!node || count === 0) return 0;
      const rect = node.getBoundingClientRect();
      const ratio = (clientX - rect.left - pad.l) / innerW;
      const index = type === "bar" ? Math.floor(ratio * count) : Math.round(ratio * (count - 1));
      return clamp(index, 0, count - 1);
    },
    [count, innerW, pad.l, type],
  );

  // A mouse leaving the plot drops the crosshair; a finger lifting keeps the
  // reading on screen, because that is the only way to read it after the touch.
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onActive(pick(event.clientX));
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current && event.pointerType !== "mouse") return;
    onActive(pick(event.clientX));
  };
  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const ticks = [0, 0.5, 1].map((fraction) => max * fraction);
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 78))));
  const barStep = innerW / Math.max(1, count);
  const barWidth = Math.max(1, barStep - (barStep >= 5 ? 2 : 0));

  return (
    <div ref={wrapRef} className={cn("w-full", className)}>
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block touch-pan-y select-none"
          role="img"
          aria-label={series.map((item) => item.label).join(", ")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") {
              dragging.current = false;
              onActive(null);
            }
          }}
        >
          <defs>
            {series.map((item) => (
              <linearGradient
                key={item.key}
                id={`${gradientId}-${item.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity={stacked ? 0.9 : 0.34} />
                <stop offset="100%" stopColor={item.color} stopOpacity={stacked ? 0.9 : 0.02} />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--m-grid)"
                strokeWidth={1}
              />
              <text
                x={pad.l - 5}
                y={yAt(tick) + 3}
                textAnchor="end"
                fontSize={9.5}
                className="fill-muted-foreground"
              >
                {formatY(tick)}
              </text>
            </g>
          ))}

          {type === "bar"
            ? series.map((item, layer) => (
                <g key={item.key}>
                  {item.values.map((value, index) => {
                    if (!value) return null;
                    const base = stacked ? stacks[layer][index] : 0;
                    const top = yAt(base + value);
                    const bottom = yAt(base);
                    const barHeight = Math.max(1, bottom - top - (stacked && barStep >= 5 ? 1 : 0));
                    return (
                      <rect
                        key={index}
                        x={xAt(index) - barWidth / 2}
                        y={top}
                        width={barWidth}
                        height={barHeight}
                        rx={barWidth >= 6 ? 2 : 0}
                        fill={item.color}
                        opacity={
                          (dimFrom != null && index >= dimFrom ? 0.4 : 1) *
                          (active == null || active === index ? 1 : 0.5)
                        }
                      />
                    );
                  })}
                </g>
              ))
            : series.map((item, layer) => {
                const points: string[] = [];
                const baseline: string[] = [];
                for (let index = 0; index < count; index += 1) {
                  const base = stacked ? stacks[layer][index] : 0;
                  points.push(`${xAt(index)},${yAt(base + (item.values[index] ?? 0))}`);
                  baseline.push(`${xAt(index)},${yAt(base)}`);
                }
                const line = points.join(" ");
                const area = `${line} ${baseline.reverse().join(" ")}`;
                return (
                  <g key={item.key}>
                    {type === "area" ? (
                      <polygon points={area} fill={`url(#${gradientId}-${item.key})`} />
                    ) : null}
                    <polyline
                      points={line}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

          {dates.map((day, index) => {
            if (index % labelEvery !== 0) return null;
            const x = xAt(index);
            if (x < pad.l + 12 || x > width - pad.r - 12) return null;
            return (
              <text
                key={day}
                x={x}
                y={height - 5}
                textAnchor="middle"
                fontSize={9.5}
                className="fill-muted-foreground"
              >
                {formatX(day, index)}
              </text>
            );
          })}

          {active != null && active >= 0 && active < count ? (
            <g pointerEvents="none">
              <line
                x1={xAt(active)}
                x2={xAt(active)}
                y1={pad.t}
                y2={pad.t + innerH}
                stroke="var(--m-crosshair)"
                strokeWidth={1}
              />
              {type !== "bar"
                ? series.map((item, layer) => {
                    const base = stacked ? stacks[layer][active] : 0;
                    return (
                      <circle
                        key={item.key}
                        cx={xAt(active)}
                        cy={yAt(base + (item.values[active] ?? 0))}
                        r={3.5}
                        fill={item.color}
                        stroke="var(--card)"
                        strokeWidth={2}
                      />
                    );
                  })
                : null}
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}

/**
 * The overview strip under the chart. The whole history is drawn once; dragging
 * either edge or the shaded middle sets the window above it. This is the
 * interval control that works with a thumb.
 */
export function RangeBrush({
  values,
  dates,
  from,
  to,
  onChange,
  height = 40,
}: {
  values: number[];
  dates: string[];
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
  height?: number;
}) {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ mode: "from" | "to" | "pan"; anchor: number; from: number; to: number } | null>(
    null,
  );
  const count = values.length;
  const max = Math.max(...values, 1);

  const xAt = useCallback(
    (index: number) => (count <= 1 ? 0 : (index / (count - 1)) * width),
    [count, width],
  );
  const indexAt = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return clamp(Math.round(((clientX - rect.left) / rect.width) * (count - 1)), 0, count - 1);
    },
    [count],
  );

  const area = useMemo(() => {
    if (!width || count < 2) return "";
    const points = values.map((value, index) => `${xAt(index)},${height - (value / max) * (height - 4) - 2}`);
    return `0,${height} ${points.join(" ")} ${width},${height}`;
  }, [count, height, max, values, width, xAt]);

  const startDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const index = indexAt(event.clientX);
    const nearFrom = Math.abs(xAt(index) - xAt(from));
    const nearTo = Math.abs(xAt(index) - xAt(to));
    const grab = 22;
    const mode =
      nearFrom <= grab && nearFrom <= nearTo
        ? "from"
        : nearTo <= grab
          ? "to"
          : index > from && index < to
            ? "pan"
            : nearFrom < nearTo
              ? "from"
              : "to";
    drag.current = { mode, anchor: index, from, to };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "from") onChange(Math.min(index, to - 1), to);
    if (mode === "to") onChange(from, Math.max(index, from + 1));
  };

  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    if (!state) return;
    const index = indexAt(event.clientX);
    if (state.mode === "from") onChange(clamp(index, 0, to - 1), to);
    else if (state.mode === "to") onChange(from, clamp(index, from + 1, count - 1));
    else {
      const span = state.to - state.from;
      const shift = index - state.anchor;
      const nextFrom = clamp(state.from + shift, 0, count - 1 - span);
      onChange(nextFrom, nextFrom + span);
    }
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div ref={wrapRef} className="w-full">
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block cursor-ew-resize touch-none select-none"
          aria-label={`Range ${dates[from]} to ${dates[to]}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <polygon points={area} fill="var(--m-brush-fill)" />
          <rect x={0} y={0} width={xAt(from)} height={height} fill="var(--m-brush-mask)" />
          <rect
            x={xAt(to)}
            y={0}
            width={Math.max(0, width - xAt(to))}
            height={height}
            fill="var(--m-brush-mask)"
          />
          <rect
            x={xAt(from)}
            y={0.5}
            width={Math.max(1, xAt(to) - xAt(from))}
            height={height - 1}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={1}
            rx={3}
          />
          {[from, to].map((edge, position) => (
            <g key={position}>
              <rect
                x={clamp(xAt(edge) - 3, 0, width - 6)}
                y={height / 2 - 9}
                width={6}
                height={18}
                rx={3}
                fill="var(--brand)"
              />
            </g>
          ))}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}

/** A coloured sparkline small enough to sit inside a table row. */
export function MiniSpark({
  values,
  color,
  width = 56,
  height = 18,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Horizontal ranked bars — the shape for "biggest of a category". */
export function RankedBars({
  rows,
  format,
}: {
  rows: Array<{ key: string; label: string; value: number; hint?: string }>;
  format: (value: number) => string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{row.label}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-gradient"
                style={{ width: `${Math.max(1.5, (row.value / max) * 100)}%` }}
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tabular-nums">{format(row.value)}</p>
            {row.hint ? (
              <p className="text-[0.65rem] leading-tight text-muted-foreground">{row.hint}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Keeps a value in localStorage without tripping over server rendering. */
export function useStickyState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored != null) setValue(JSON.parse(stored) as T);
    } catch {
      // A private window or a stale shape is not worth breaking the page over.
    }
    loaded.current = true;
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota and privacy errors: the preference is a convenience.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
