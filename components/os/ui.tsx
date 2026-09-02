import type { ReactNode } from "react";
import Link from "next/link";

import { formatDate, formatSekTile } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import type { LedgerEntryRow, SourceState } from "@/lib/os/types";
import { Sparkline } from "@/components/os/charts";
import { cn } from "@/lib/utils";

/**
 * Every page sits in this frame. The bottom padding clears the mobile tab bar
 * plus the home indicator; on desktop the bar is gone and the padding relaxes.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-3 pt-2 sm:px-4 sm:pt-3 md:pb-5"
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        paddingBottom: "calc(5.25rem + env(safe-area-inset-bottom))",
      }}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  children,
  aside,
  action,
}: {
  children: ReactNode;
  aside?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{children}</h1>
      {aside ? (
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{aside}</p>
      ) : null}
      {action}
    </div>
  );
}

/** A labelled band above a group of cards. Keeps long pages scannable. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-0.5 flex items-baseline justify-between gap-2">
      <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function KpiGrid({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  return (
    <section
      className={cn(
        "grid gap-2",
        // Three tiles read better as one even row than as two plus an orphan.
        columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
      )}
    >
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  spark,
  tone = "default",
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  spark?: number[];
  tone?: "default" | "positive" | "negative";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between rounded-xl bg-card p-3 ring-1 ring-foreground/10",
        emphasis && "ring-brand/40",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums tracking-tight break-words sm:text-2xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      {spark && spark.length > 1 ? <Sparkline values={spark} className="mt-2 h-7 w-full" /> : null}
    </div>
  );
}

/**
 * The headline numbers. Bigger than a KpiCard because these are the four the
 * owner actually opens the dashboard to read.
 */
export function HeroStats({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    hint?: string;
    tone?: "default" | "positive" | "negative";
  }>;
}) {
  return (
    <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4"
        >
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums tracking-tight break-words sm:text-3xl",
              item.tone === "positive" && "text-positive",
              item.tone === "negative" && "text-destructive",
            )}
          >
            {item.value}
          </p>
          {item.hint ? (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export function Panel({
  title,
  action,
  children,
  footer,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {title ? (
        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
      {footer ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{footer}</div>
      ) : null}
    </section>
  );
}

/** A row inside a Panel. One consistent height so lists read as lists. */
export function Row({
  primary,
  secondary,
  value,
  valueTone = "default",
  badge,
  href,
  external = false,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  value?: ReactNode;
  valueTone?: "default" | "positive" | "negative" | "muted";
  badge?: ReactNode;
  href?: string | null;
  external?: boolean;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{primary}</p>
        {secondary ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{secondary}</p>
        ) : null}
      </div>
      {badge}
      {value != null ? (
        <p
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            valueTone === "positive" && "text-positive",
            valueTone === "negative" && "text-destructive",
            valueTone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </p>
      ) : null}
    </>
  );

  const className =
    "flex min-h-11 items-center gap-3 border-t border-border px-3 py-2 first:border-t-0";

  if (!href) return <div className={className}>{body}</div>;
  if (external) {
    return (
      <a className={cn(className, "hover:bg-muted/60")} href={href} rel="noreferrer" target="_blank">
        {body}
      </a>
    );
  }
  return (
    <Link className={cn(className, "hover:bg-muted/60")} href={routeHref(href)}>
      {body}
    </Link>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warn" | "brand";
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "warn" && "bg-destructive/15 text-destructive",
        tone === "brand" && "bg-brand-soft text-brand",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-3 py-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function NoticeCard({
  title,
  detail,
  tone = "warn",
}: {
  title: string;
  detail: string;
  tone?: "warn" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5 ring-1",
        tone === "warn"
          ? "bg-destructive/10 ring-destructive/30"
          : "bg-card ring-foreground/10",
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function ConnectFootnote({
  sources,
  extra,
}: {
  sources: SourceState[];
  extra?: string[];
}) {
  const later = [
    ...sources.filter((source) => !source.wired).map((source) => source.label),
    ...(extra ?? []),
  ];
  if (!later.length) return null;
  return (
    <p className="pt-1 text-xs leading-snug text-muted-foreground">
      Not connected yet: {later.join(" · ")}
    </p>
  );
}

export function EntryList({
  entries,
  vaultBase,
  emptyLabel = "No entries.",
}: {
  entries: LedgerEntryRow[];
  vaultBase: string;
  emptyLabel?: string;
}) {
  if (!entries.length) {
    return <EmptyState title={emptyLabel} detail="Nothing booked in this window." />;
  }
  return (
    <div>
      {entries.map((entry) => (
        <Row
          key={entry.id}
          href={`${vaultBase}?post=${entry.id}`}
          primary={entry.description}
          secondary={formatDate(entry.date)}
          badge={entry.missingReceipt ? <Pill tone="warn">kvitto</Pill> : undefined}
          value={`${entry.kind === "expense" ? "−" : entry.kind === "income" ? "+" : ""}${formatSekTile(
            entry.amountCents,
          )}`}
          valueTone={entry.kind === "expense" ? "muted" : entry.kind === "income" ? "positive" : "default"}
        />
      ))}
    </div>
  );
}

export function OsPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 p-3 sm:p-4">
      <div className="h-7 w-40 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
