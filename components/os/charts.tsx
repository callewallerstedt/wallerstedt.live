"use client"

import { useId } from "react"

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
