"use client";

import { useId, useState, type PointerEvent } from "react";

import { formatSekTile } from "@/lib/os/format";

/** Axis labels: 950, 12k, 1.2M. */
const compact = (cents: number) => {
  const kr = cents / 100;
  const abs = Math.abs(kr);
  if (abs >= 1_000_000) return `${(kr / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${Math.round(kr / 1_000)}k`;
  return String(Math.round(kr));
};

function useHover(count: number, left: number, width: number, viewWidth: number) {
  const [index, setIndex] = useState<number | null>(null);
  function onMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * viewWidth;
    const ratio = (x - left) / width;
    const next = Math.round(ratio * (count - 1));
    setIndex(Math.max(0, Math.min(count - 1, next)));
  }
  return { index, onMove, onLeave: () => setIndex(null) };
}

/** Donut of spending per category with the total in the middle. */
export function CategoryDonut({
  slices,
  total,
  caption,
}: {
  slices: Array<{ id: string; value: number; color: string; label: string }>;
  total: number;
  caption: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const positive = slices.filter((slice) => slice.value > 0);
  const sum = positive.reduce((acc, slice) => acc + slice.value, 0) || 1;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const focus = positive.find((slice) => slice.id === active);

  return (
    <svg viewBox="0 0 120 120" className="size-44 shrink-0 sm:size-52" role="img" aria-label="Spending by category">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="color-mix(in oklch, var(--foreground) 8%, transparent)" strokeWidth="14" />
      {positive.map((slice) => {
        const length = (slice.value / sum) * circumference;
        const gap = positive.length > 1 ? Math.min(1.2, length / 3) : 0;
        const element = (
          <circle
            key={slice.id}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth={active === slice.id ? 17 : 14}
            strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
            className="cursor-pointer transition-[stroke-width] duration-150"
            onPointerEnter={() => setActive(slice.id)}
            onPointerLeave={() => setActive(null)}
            onClick={() => setActive((current) => (current === slice.id ? null : slice.id))}
          />
        );
        offset += length;
        return element;
      })}
      <text x="60" y="55" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 7.5 }}>
        {focus ? focus.label.slice(0, 22) : caption}
      </text>
      <text x="60" y="69" textAnchor="middle" className="fill-foreground font-semibold" style={{ fontSize: 12.5 }}>
        {formatSekTile(focus ? focus.value : total)}
      </text>
      {focus ? (
        <text x="60" y="80" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 7 }}>
          {Math.round((focus.value / sum) * 100)}%
        </text>
      ) : null}
    </svg>
  );
}

/**
 * Money spent so far this month, day by day, against last month's curve and
 * the even pace that would land exactly on the total budget.
 */
export function PaceChart({
  cumulative,
  previous,
  daysInMonth,
  budgetTotal,
  projected,
}: {
  cumulative: number[];
  previous: number[];
  daysInMonth: number;
  budgetTotal: number | null;
  projected: number | null;
}) {
  const id = useId().replace(/:/g, "");
  const width = 640;
  const height = 210;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...cumulative, ...previous, budgetTotal ?? 0, projected ?? 0);
  const x = (day: number) => pad.l + (day / Math.max(daysInMonth - 1, 1)) * innerW;
  const y = (value: number) => pad.t + innerH - (Math.max(0, value) / max) * innerH;
  const path = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join(" ");
  const hover = useHover(daysInMonth, pad.l, innerW, width);
  const hi = hover.index;
  const last = cumulative.length - 1;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full touch-none select-none"
        role="img"
        aria-label="Spending pace this month"
        onPointerMove={hover.onMove}
        onPointerDown={hover.onMove}
        onPointerLeave={hover.onLeave}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--brand-from)" />
            <stop offset="100%" stopColor="var(--brand-to)" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line x1={pad.l} x2={width - pad.r} y1={y(max * ratio)} y2={y(max * ratio)} stroke="currentColor" strokeOpacity="0.08" />
            <text x={pad.l - 6} y={y(max * ratio) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
              {compact(max * ratio)}
            </text>
          </g>
        ))}
        {[1, 8, 15, 22, daysInMonth].map((day) => (
          <text key={day} x={x(day - 1)} y={height - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
            {day}
          </text>
        ))}
        {budgetTotal ? (
          <>
            <line x1={x(0)} y1={y(0)} x2={x(daysInMonth - 1)} y2={y(budgetTotal)} stroke="var(--positive)" strokeOpacity="0.7" strokeDasharray="5 5" strokeWidth="1.5" />
            <text x={x(daysInMonth - 1) - 4} y={y(budgetTotal) - 5} textAnchor="end" style={{ fontSize: 10, fill: "var(--positive)" }}>
              budget {compact(budgetTotal)}
            </text>
          </>
        ) : null}
        {previous.length > 1 ? (
          <path d={path(previous)} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="3 4" />
        ) : null}
        {cumulative.length > 1 ? (
          <>
            <path d={`${path(cumulative)} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-fill)`} />
            <path d={path(cumulative)} fill="none" stroke={`url(#${id}-line)`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}
        {projected != null && last >= 0 && last < daysInMonth - 1 ? (
          <line x1={x(last)} y1={y(cumulative[last] ?? 0)} x2={x(daysInMonth - 1)} y2={y(projected)} stroke="var(--brand)" strokeOpacity="0.6" strokeDasharray="2 4" strokeWidth="2" />
        ) : null}
        {last >= 0 ? <circle cx={x(last)} cy={y(cumulative[last] ?? 0)} r="4" fill="var(--brand)" /> : null}
        {hi != null ? (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + innerH} stroke="currentColor" strokeOpacity="0.25" />
            {cumulative[hi] != null ? <circle cx={x(hi)} cy={y(cumulative[hi]!)} r="3.5" fill="var(--brand)" /> : null}
          </g>
        ) : null}
      </svg>
      {hi != null ? (
        <div className="pointer-events-none absolute top-1 right-2 rounded-md bg-popover/95 px-2 py-1 text-[0.7rem] shadow ring-1 ring-foreground/10">
          <p className="font-semibold">Day {hi + 1}</p>
          <p>This month: {cumulative[hi] != null ? formatSekTile(cumulative[hi]) : "—"}</p>
          <p className="text-muted-foreground">Last month: {formatSekTile(previous[hi] ?? previous[previous.length - 1] ?? 0)}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Income and spending side by side per month, with the net as a dot. */
export function IncomeSpendBars({
  months,
  labels,
  selected,
  onSelect,
}: {
  months: Array<{ month: string; incomeCents: number; spendingCents: number; netCents: number; hasData: boolean }>;
  labels: string[];
  selected: string;
  onSelect?: (month: string) => void;
}) {
  const width = 640;
  const height = 200;
  const pad = { l: 44, r: 8, t: 12, b: 24 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...months.map((row) => Math.max(row.incomeCents, row.spendingCents)));
  const slot = innerW / Math.max(months.length, 1);
  const barW = Math.max(3, Math.min(16, slot * 0.32));
  const y = (value: number) => pad.t + innerH - (Math.max(0, value) / max) * innerH;
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover != null ? months[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full select-none" role="img" aria-label="Income and spending per month">
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line x1={pad.l} x2={width - pad.r} y1={y(max * ratio)} y2={y(max * ratio)} stroke="currentColor" strokeOpacity="0.08" />
            <text x={pad.l - 6} y={y(max * ratio) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
              {compact(max * ratio)}
            </text>
          </g>
        ))}
        {months.map((row, index) => {
          const cx = pad.l + slot * index + slot / 2;
          const isSelected = row.month === selected;
          return (
            <g
              key={row.month}
              className="cursor-pointer"
              opacity={row.hasData ? (hover == null || hover === index ? 1 : 0.55) : 0.25}
              onPointerEnter={() => setHover(index)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect?.(row.month)}
            >
              <rect x={pad.l + slot * index} y={pad.t} width={slot} height={innerH} fill={isSelected ? "color-mix(in oklch, var(--brand) 10%, transparent)" : "transparent"} rx="6" />
              <rect x={cx - barW - 1} y={y(row.incomeCents)} width={barW} height={Math.max(0, y(0) - y(row.incomeCents))} rx="2.5" fill="var(--positive)" />
              <rect x={cx + 1} y={y(row.spendingCents)} width={barW} height={Math.max(0, y(0) - y(row.spendingCents))} rx="2.5" fill="var(--brand)" />
              <text x={cx} y={height - 6} textAnchor="middle" className={isSelected ? "fill-foreground font-semibold" : "fill-muted-foreground"} style={{ fontSize: 10 }}>
                {labels[index]}
              </text>
            </g>
          );
        })}
      </svg>
      {focus ? (
        <div className="pointer-events-none absolute top-1 left-12 rounded-md bg-popover/95 px-2 py-1 text-[0.7rem] shadow ring-1 ring-foreground/10">
          <p className="font-semibold">{labels[hover!]}</p>
          <p className="text-positive">In {formatSekTile(focus.incomeCents)}</p>
          <p className="text-brand">Out {formatSekTile(focus.spendingCents)}</p>
          <p className={focus.netCents < 0 ? "text-destructive" : ""}>Net {formatSekTile(focus.netCents)}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A plain value-over-time line with a hover read-out. */
export function BalanceLine({
  points,
  label,
}: {
  points: Array<{ date: string; cents: number }>;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const width = 640;
  const height = 190;
  const pad = { l: 48, r: 10, t: 12, b: 24 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const hover = useHover(points.length, pad.l, innerW, width);
  if (points.length < 2) return null;
  const values = points.map((point) => point.cents);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const x = (index: number) => pad.l + (index / (points.length - 1)) * innerW;
  const y = (value: number) => pad.t + innerH - ((value - min) / span) * innerH;
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join(" ");
  const hi = hover.index;
  const tickIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const dateLabel = (value: string) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString("sv-SE", { month: "short", year: "2-digit" });

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full touch-none select-none"
        role="img"
        aria-label={label}
        onPointerMove={hover.onMove}
        onPointerDown={hover.onMove}
        onPointerLeave={hover.onLeave}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--brand-from)" />
            <stop offset="100%" stopColor="var(--brand-to)" />
          </linearGradient>
        </defs>
        {[min, (min + max) / 2, max].map((value) => (
          <g key={value}>
            <line x1={pad.l} x2={width - pad.r} y1={y(value)} y2={y(value)} stroke="currentColor" strokeOpacity="0.08" />
            <text x={pad.l - 6} y={y(value) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
              {compact(value)}
            </text>
          </g>
        ))}
        {tickIndexes.map((index) => (
          <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} className="fill-muted-foreground" style={{ fontSize: 10 }}>
            {dateLabel(points[index]!.date)}
          </text>
        ))}
        <path d={`${line} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z`} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="2.5" strokeLinejoin="round" />
        {hi != null ? (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + innerH} stroke="currentColor" strokeOpacity="0.25" />
            <circle cx={x(hi)} cy={y(values[hi]!)} r="4" fill="var(--brand)" />
          </g>
        ) : null}
      </svg>
      {hi != null ? (
        <div className="pointer-events-none absolute top-1 right-2 rounded-md bg-popover/95 px-2 py-1 text-[0.7rem] shadow ring-1 ring-foreground/10">
          <p className="text-muted-foreground">{points[hi]!.date}</p>
          <p className="font-semibold">{formatSekTile(values[hi]!)}</p>
        </div>
      ) : null}
    </div>
  );
}

export function WeekdayBars({ values }: { values: number[] }) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return (
    <div className="grid grid-cols-7 items-end gap-1.5 px-3 pb-3" style={{ height: 150 }}>
      {values.map((value, index) => (
        <div key={labels[index]} className="flex h-full flex-col items-center justify-end gap-1">
          <span className="text-[0.62rem] tabular-nums text-muted-foreground">{Math.round((value / total) * 100)}%</span>
          <div
            className="w-full rounded-md bg-brand-gradient"
            style={{ height: `${Math.max(3, (value / max) * 100)}px`, opacity: 0.45 + (value / max) * 0.55 }}
            title={formatSekTile(value)}
          />
          <span className="text-[0.65rem] text-muted-foreground">{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}

/** Tiny bars for one category's last months. */
export function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden>
      {values.map((value, index) => (
        <div
          key={index}
          className="w-1.5 rounded-sm"
          style={{
            height: `${Math.max(8, (Math.max(0, value) / max) * 100)}%`,
            background: color,
            opacity: index === values.length - 1 ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

/** Budget progress bar with a marker where "today" should be. */
export function BudgetBar({
  ratio,
  pace,
  color,
}: {
  ratio: number;
  /** 0..1 share of the month that has passed; hidden for past months. */
  pace: number | null;
  color: string;
}) {
  const over = ratio > 1;
  const warn = !over && pace != null && ratio > pace * 1.1;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-foreground/8">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.min(100, ratio * 100)}%`,
          background: over ? "var(--destructive)" : warn ? "oklch(0.75 0.16 70)" : color,
        }}
      />
      {pace != null && pace < 1 ? (
        <div className="absolute top-0 h-full w-0.5 bg-foreground/60" style={{ left: `${pace * 100}%` }} />
      ) : null}
    </div>
  );
}

/**
 * What was kept each month (income minus spending, as bars) and the running
 * total of it (the line), so a good month and the long trend read together.
 */
export function SavingsChart({
  months,
  labels,
}: {
  months: Array<{ month: string; netCents: number; savedCents: number }>;
  labels: string[];
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 210;
  const pad = { l: 48, r: 10, t: 14, b: 24 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const cumulative: number[] = [];
  let running = 0;
  for (const row of months) {
    running += row.netCents;
    cumulative.push(running);
  }
  const values = [...months.map((row) => row.netCents), ...cumulative, 0];
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const y = (value: number) => pad.t + innerH - ((value - min) / span) * innerH;
  const slot = innerW / Math.max(months.length, 1);
  const barW = Math.max(4, Math.min(26, slot * 0.55));
  const cx = (index: number) => pad.l + slot * index + slot / 2;
  const line = cumulative.map((value, index) => `${index ? "L" : "M"}${cx(index)},${y(value)}`).join(" ");
  const focus = hover != null ? months[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full select-none" role="img" aria-label="Money kept per month and in total">
        <defs>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--brand-from)" />
            <stop offset="100%" stopColor="var(--brand-to)" />
          </linearGradient>
        </defs>
        {[min, 0, max].filter((value, index, list) => list.indexOf(value) === index).map((value) => (
          <g key={value}>
            <line x1={pad.l} x2={width - pad.r} y1={y(value)} y2={y(value)} stroke="currentColor" strokeOpacity={value === 0 ? 0.25 : 0.08} />
            <text x={pad.l - 6} y={y(value) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
              {compact(value)}
            </text>
          </g>
        ))}
        {months.map((row, index) => (
          <g key={row.month} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)} className="cursor-default">
            <rect x={pad.l + slot * index} y={pad.t} width={slot} height={innerH} fill="transparent" />
            <rect
              x={cx(index) - barW / 2}
              y={Math.min(y(row.netCents), y(0))}
              width={barW}
              height={Math.max(1, Math.abs(y(row.netCents) - y(0)))}
              rx="3"
              fill={row.netCents >= 0 ? "var(--positive)" : "var(--destructive)"}
              opacity={hover == null || hover === index ? 0.85 : 0.45}
            />
            <text x={cx(index)} y={height - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
              {labels[index]}
            </text>
          </g>
        ))}
        {months.length > 1 ? <path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="2.5" strokeLinejoin="round" /> : null}
        {cumulative.map((value, index) => (
          <circle key={index} cx={cx(index)} cy={y(value)} r={hover === index ? 4.5 : 3} fill="var(--brand)" />
        ))}
      </svg>
      {focus ? (
        <div className="pointer-events-none absolute top-1 left-14 rounded-md bg-popover/95 px-2 py-1 text-[0.7rem] shadow ring-1 ring-foreground/10">
          <p className="font-semibold">{labels[hover!]}</p>
          <p className={focus.netCents < 0 ? "text-destructive" : "text-positive"}>Kept {formatSekTile(focus.netCents)}</p>
          {focus.savedCents ? <p>To savings {formatSekTile(focus.savedCents)}</p> : null}
          <p className="text-muted-foreground">Running total {formatSekTile(cumulative[hover!]!)}</p>
        </div>
      ) : null}
    </div>
  );
}
