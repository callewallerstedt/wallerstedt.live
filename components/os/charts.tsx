"use client"

import { useId } from "react"

import { formatDate, formatSekTile } from "@/lib/os/format"

function BrandGradientDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--brand-from)" />
        <stop offset="100%" stopColor="var(--brand-to)" />
      </linearGradient>
      <linearGradient id={`${id}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
        <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
      </linearGradient>
    </defs>
  )
}

function toPoints(values: number[], width: number, height: number) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / span) * height
    return [x, y] as const
  })
}

export function Sparkline({
  values,
  className,
}: {
  values: number[]
  className?: string
}) {
  const id = useId().replace(/:/g, "")
  const width = 120
  const height = 28
  const points = toPoints(values, width, height)
  const line = points.map(([x, y]) => `${x},${y}`).join(" ")
  const area = `0,${height} ${line} ${width},${height}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      <BrandGradientDefs id={id} />
      <polygon points={area} fill={`url(#${id}-fill)`} />
      <polyline
        points={line}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function TrendChart({
  values,
  labels,
  label = "Trend",
  compact = false,
}: {
  values: number[];
  labels: string[];
  label?: string;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "")
  const width = 640
  const height = compact ? 80 : 220
  const pad = compact
    ? { l: 36, r: 8, t: 4, b: 16 }
    : { l: 52, r: 12, t: 16, b: 28 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  if (values.length < 2) {
    return null
  }
  const min = Math.min(0, ...values)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const points = values.map((value, index) => {
    const x = pad.l + (index / (values.length - 1)) * innerW
    const y = pad.t + innerH - ((value - min) / span) * innerH
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x},${y}`).join(" ")
  const zeroY = pad.t + innerH - ((0 - min) / span) * innerH
  const area = `${pad.l},${zeroY} ${line} ${pad.l + innerW},${zeroY}`
  const ticks = [max, (max + min) / 2, min]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={compact ? "h-20 w-full" : "h-full w-full"}
      role="img"
      aria-label={label}
    >
      <BrandGradientDefs id={id} />
      {ticks.map((tick) => {
        const y = pad.t + innerH - ((tick - min) / span) * innerH
        return (
          <g key={tick}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
            />
            <text
              x={pad.l - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
              fontFamily="var(--font-inter)"
            >
              {new Intl.NumberFormat("sv-SE", { notation: "compact" }).format(tick / 100)}
            </text>
          </g>
        )
      })}
      <polygon points={area} fill={`url(#${id}-fill)`} />
      <polyline
        points={line}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {labels.map((item, index) => {
        if (compact && index % 3 !== 0 && index !== labels.length - 1) return null
        const x = pad.l + (index / (labels.length - 1)) * innerW
        return (
          <text
            key={`${item}-${index}`}
            x={x}
            y={height - 4}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
            fontFamily="var(--font-inter)"
          >
            {item}
          </text>
        )
      })}
    </svg>
  )
}

export function DualTrendChart({
  labels,
  series,
  unit = "sek",
  compact = false,
}: {
  labels: string[];
  series: Array<{
    key: string;
    label: string;
    values: number[];
    tone?: "brand" | "muted";
    fill?: boolean;
  }>;
  unit?: "sek" | "count";
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "")
  const width = 640
  const height = compact ? 104 : 148
  const pad = compact
    ? { l: 34, r: 8, t: 8, b: 18 }
    : { l: 40, r: 10, t: 10, b: 20 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const values = series.flatMap((item) => item.values)
  if (values.length < 2 || series[0]?.values.length < 2) return null
  const min = Math.min(0, ...values)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const ticks = [max, (max + min) / 2, min]
  const formatTick = (tick: number) =>
    new Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(
      unit === "sek" ? tick / 100 : tick,
    )
  const pointsFor = (itemValues: number[]) =>
    itemValues.map((value, index) => {
      const x = pad.l + (index / (itemValues.length - 1)) * innerW
      const y = pad.t + innerH - ((value - min) / span) * innerH
      return [x, y] as const
    })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={compact ? "h-28 w-full" : "h-36 w-full"}
      role="img"
      aria-label={series.map((item) => item.label).join(" vs ")}
    >
      <BrandGradientDefs id={id} />
      {ticks.map((tick) => {
        const y = pad.t + innerH - ((tick - min) / span) * innerH
        return (
          <g key={tick}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
            />
            <text
              x={pad.l - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
              fontFamily="var(--font-inter)"
            >
              {formatTick(tick)}
            </text>
          </g>
        )
      })}
      {series.map((item, seriesIndex) => {
        const points = pointsFor(item.values)
        const line = points.map(([x, y]) => `${x},${y}`).join(" ")
        const zeroY = pad.t + innerH - ((0 - min) / span) * innerH
        const area = `${pad.l},${zeroY} ${line} ${pad.l + innerW},${zeroY}`
        const stroke = item.tone === "muted" ? "var(--chart-2)" : `url(#${id})`
        return (
          <g key={item.key}>
            {item.fill ? <polygon points={area} fill={`url(#${id}-fill)`} /> : null}
            <polyline
              points={line}
              fill="none"
              stroke={stroke}
              strokeWidth={seriesIndex === 0 ? 2.25 : 1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={item.tone === "muted" ? "0" : undefined}
            />
          </g>
        )
      })}
      {labels.map((item, index) => {
        if (!item) return null
        const filled = labels.filter(Boolean).length
        const sparse = filled < labels.length
        const step = Math.max(1, Math.round((labels.length - 1) / 6))
        if (!sparse && index % step !== 0 && index !== labels.length - 1) return null
        const x = pad.l + (index / Math.max(1, labels.length - 1)) * innerW
        return (
          <text
            key={`${item}-${index}`}
            x={x}
            y={height - 5}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
            fontFamily="var(--font-inter)"
          >
            {item}
          </text>
        )
      })}
    </svg>
  )
}

export function RetentionChart({
  values,
  labels,
}: {
  values: number[]
  labels: string[]
}) {
  const id = useId().replace(/:/g, "")
  const width = 640
  const height = 220
  const pad = { l: 36, r: 12, t: 16, b: 28 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const points = toPoints(values, innerW, innerH).map(
    ([x, y]) => [x + pad.l, y + pad.t] as const
  )
  const line = points.map(([x, y]) => `${x},${y}`).join(" ")
  const area = `${pad.l},${height - pad.b} ${line} ${pad.l + innerW},${height - pad.b}`
  const yTicks = [100, 75, 50, 25, 0]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label="Retention trend"
    >
      <BrandGradientDefs id={id} />
      {yTicks.map((tick) => {
        const y = pad.t + innerH - (tick / 100) * innerH
        return (
          <g key={tick}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
            />
            <text
              x={pad.l - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
              fontFamily="var(--font-inter)"
            >
              {tick}%
            </text>
          </g>
        )
      })}
      <polygon points={area} fill={`url(#${id}-fill)`} />
      <polyline
        points={line}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {labels.map((label, index) => {
        const x = pad.l + (index / (labels.length - 1)) * innerW
        return (
          <text
            key={label}
            x={x}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
            fontFamily="var(--font-inter)"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}

export function RiskDonut({
  high,
  medium,
  low,
}: {
  high: number
  medium: number
  low: number
}) {
  const total = high + medium + low
  const radius = 42
  const circ = 2 * Math.PI * radius
  const segs = [
    { value: high, color: "var(--brand)" },
    { value: medium, color: "color-mix(in oklch, var(--brand) 55%, white)" },
    { value: low, color: "color-mix(in oklch, var(--foreground) 22%, transparent)" },
  ]
  let offset = 0

  return (
    <svg
      viewBox="0 0 120 120"
      className="size-36"
      role="img"
      aria-label="Risk score distribution"
    >
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-muted"
        strokeWidth="12"
      />
      {segs.map((seg) => {
        const len = (seg.value / total) * circ
        const dashoffset = -offset
        offset += len
        return (
          <circle
            key={seg.color}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="12"
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 60 60)"
          />
        )
      })}
      <text
        x="60"
        y="56"
        textAnchor="middle"
        className="fill-foreground"
        fontSize="18"
        fontWeight="600"
        fontFamily="var(--font-inter)"
      >
        {total.toLocaleString()}
      </text>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize="9"
        fontFamily="var(--font-inter)"
      >
        At risk
      </text>
    </svg>
  )
}

export function ScoreRing({ score }: { score: number }) {
  const radius = 14
  const circ = 2 * Math.PI * radius
  const filled = (score / 100) * circ
  return (
    <svg viewBox="0 0 36 36" className="size-8" aria-label={`Risk score ${score}`}>
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-muted"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeDasharray={`${filled} ${circ - filled}`}
        transform="rotate(-90 18 18)"
        strokeLinecap="round"
      />
      <text
        x="18"
        y="21"
        textAnchor="middle"
        className="fill-foreground"
        fontSize="9"
        fontWeight="600"
        fontFamily="var(--font-inter)"
      >
        {score}
      </text>
    </svg>
  )
}

/**
 * Monthly result as bars. A line implies the value flows between months; a
 * month's profit does not, so bars read the truth and make a loss month
 * obvious at a glance.
 */
export function MonthlyBars({
  labels,
  values,
  unit = "sek",
}: {
  labels: string[];
  values: number[];
  unit?: "sek" | "count";
}) {
  const id = useId().replace(/:/g, "")
  if (values.length < 2) return null

  const width = 640
  const height = 172
  const pad = { l: 42, r: 10, t: 12, b: 22 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const zeroY = pad.t + innerH - ((0 - min) / span) * innerH
  const slot = innerW / values.length
  const barW = Math.max(4, Math.min(30, slot * 0.62))

  const format = (value: number) =>
    new Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(
      unit === "sek" ? value / 100 : value,
    )

  const ticks = min < 0 ? [max, 0, min] : [max, max / 2, 0]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-40 w-full"
      role="img"
      aria-label="Result per month"
    >
      <BrandGradientDefs id={id} />
      <linearGradient id={`${id}-bar`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="var(--brand-from)" />
        <stop offset="100%" stopColor="var(--brand-to)" />
      </linearGradient>

      {ticks.map((tick) => {
        const y = pad.t + innerH - ((tick - min) / span) * innerH
        return (
          <g key={tick}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y}
              y2={y}
              stroke="currentColor"
              className={tick === 0 ? "text-muted-foreground/50" : "text-border"}
              strokeWidth="1"
            />
            <text
              x={pad.l - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
              fontFamily="var(--font-inter)"
            >
              {format(tick)}
            </text>
          </g>
        )
      })}

      {values.map((value, index) => {
        const x = pad.l + slot * index + (slot - barW) / 2
        const valueY = pad.t + innerH - ((value - min) / span) * innerH
        const y = Math.min(valueY, zeroY)
        const barH = Math.max(1.5, Math.abs(zeroY - valueY))
        const last = index === values.length - 1
        return (
          <rect
            key={`${labels[index]}-${index}`}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={Math.min(3, barW / 2)}
            fill={value < 0 ? "var(--destructive)" : `url(#${id}-bar)`}
            opacity={value < 0 ? 0.85 : last ? 1 : 0.82}
          >
            <title>{`${labels[index]}: ${format(value)}`}</title>
          </rect>
        )
      })}

      {labels.map((label, index) => {
        if (!label) return null
        const step = Math.max(1, Math.round(labels.length / 6))
        if (index % step !== 0 && index !== labels.length - 1) return null
        return (
          <text
            key={`${label}-${index}`}
            x={pad.l + slot * index + slot / 2}
            y={height - 6}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
            fontFamily="var(--font-inter)"
          >
            {label}
          </text>
        )
      })}
    </svg>
  )
}

/** Catmull-Rom through every point, emitted as cubic beziers. */
function smoothPath(points: ReadonlyArray<readonly [number, number]>) {
  if (points.length < 2) return ""
  let d = `M ${points[0]![0]},${points[0]![1]}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[i + 2] ?? p2
    // A low tension keeps the curve from overshooting a sharp jump.
    const c1x = p1[0] + (p2[0] - p0[0]) / 8
    const c1y = p1[1] + (p2[1] - p0[1]) / 8
    const c2x = p2[0] - (p3[0] - p1[0]) / 8
    const c2y = p2[1] - (p3[1] - p1[1]) / 8
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}

/**
 * The running result, one vertex per booked entry. Every payment in and out
 * bends the line, so the shape is the actual trading history rather than a
 * monthly average of it.
 */
export function CumulativeCurve({
  points,
}: {
  points: Array<{
    date: string;
    label: string;
    deltaCents: number;
    totalCents: number;
    kind: "income" | "expense";
  }>;
}) {
  const id = useId().replace(/:/g, "")
  if (points.length < 2) return null

  const width = 640
  const height = 210
  const pad = { l: 46, r: 12, t: 14, b: 24 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b

  const totals = points.map((point) => point.totalCents)
  const max = Math.max(0, ...totals)
  const min = Math.min(0, ...totals)
  const span = max - min || 1

  const x = (index: number) => pad.l + (index / (points.length - 1)) * innerW
  const y = (value: number) => pad.t + innerH - ((value - min) / span) * innerH
  const coords = points.map((point, index) => [x(index), y(point.totalCents)] as const)
  const line = smoothPath(coords)
  const zeroY = y(0)

  const compact = (cents: number) =>
    new Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100)
  const ticks = min < 0 ? [max, 0, min] : [max, (max + min) / 2, min]

  // The biggest movements get a visible dot; the rest stay hoverable only, so
  // hundreds of entries do not turn the line into a bead necklace.
  const threshold = [...points]
    .map((point) => Math.abs(point.deltaCents))
    .sort((a, b) => b - a)[Math.min(points.length - 1, 7)] ?? 0

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-52 w-full"
      role="img"
      aria-label="Running result over time"
    >
      <BrandGradientDefs id={id} />
      <linearGradient id={`${id}-area`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.3" />
        <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
      </linearGradient>

      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={y(tick)}
            y2={y(tick)}
            stroke="currentColor"
            className={tick === 0 ? "text-muted-foreground/50" : "text-border"}
            strokeWidth="1"
          />
          <text
            x={pad.l - 6}
            y={y(tick) + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize="10"
            fontFamily="var(--font-inter)"
          >
            {compact(tick)}
          </text>
        </g>
      ))}

      <path d={`${line} L ${x(points.length - 1)},${zeroY} L ${pad.l},${zeroY} Z`} fill={`url(#${id}-area)`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.map((point, index) => {
        const big = Math.abs(point.deltaCents) >= threshold && threshold > 0
        return (
          <circle
            key={`${point.date}-${index}`}
            cx={x(index)}
            cy={y(point.totalCents)}
            r={big ? 3 : 6}
            fill={big ? (point.kind === "income" ? "var(--brand)" : "var(--destructive)") : "transparent"}
            stroke={big ? "var(--card)" : "none"}
            strokeWidth={big ? 1.5 : 0}
          >
            <title>
              {[
                `${formatDate(point.date)} · ${point.label}`,
                `${point.deltaCents >= 0 ? "+" : "−"}${formatSekTile(Math.abs(point.deltaCents))}` +
                  ` → ${formatSekTile(point.totalCents)}`,
              ].join("\n")}
            </title>
          </circle>
        )
      })}

      {[0, points.length - 1].map((index) => (
        <text
          key={index}
          x={x(index)}
          y={height - 7}
          textAnchor={index === 0 ? "start" : "end"}
          className="fill-muted-foreground"
          fontSize="10"
          fontFamily="var(--font-inter)"
        >
          {formatDate(points[index]!.date)}
        </text>
      ))}
    </svg>
  )
}
