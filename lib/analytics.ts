import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";

const analyticsPath = path.join(process.cwd(), "data", "analytics.json");
const recentEventsLimit = 80;

export interface AnalyticsEvent {
  type: "pageview" | "button_click";
  path: string;
  label?: string;
  href?: string;
  title?: string;
  at: string;
}

interface AnalyticsPageMetric {
  path: string;
  title: string;
  count: number;
  lastViewedAt: string;
}

interface AnalyticsClickMetric {
  key: string;
  path: string;
  label: string;
  href: string;
  count: number;
  lastClickedAt: string;
}

interface AnalyticsStore {
  updatedAt: string;
  totals: {
    pageViews: number;
    buttonClicks: number;
  };
  pages: Record<string, AnalyticsPageMetric>;
  clicks: Record<string, AnalyticsClickMetric>;
  recentEvents: AnalyticsEvent[];
}

export interface AnalyticsSnapshot {
  updatedAt: string;
  totals: {
    pageViews: number;
    buttonClicks: number;
    trackedPages: number;
    trackedButtons: number;
  };
  pages: AnalyticsPageMetric[];
  clicks: AnalyticsClickMetric[];
  recentEvents: AnalyticsEvent[];
}

function createDefaultStore(): AnalyticsStore {
  return {
    updatedAt: "",
    totals: {
      pageViews: 0,
      buttonClicks: 0,
    },
    pages: {},
    clicks: {},
    recentEvents: [],
  };
}

async function readAnalyticsStore() {
  try {
    const raw = await readFile(analyticsPath, "utf8");
    return normalizeAnalyticsStore(JSON.parse(raw) as Partial<AnalyticsStore>);
  } catch {
    return createDefaultStore();
  }
}

function normalizeText(value: unknown, fallback = "") {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizePath(value: unknown) {
  const normalized = normalizeText(value, "/");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      return new URL(normalized).pathname || "/";
    } catch {
      return "/";
    }
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  return `/${normalized.replace(/^\/+/, "")}`;
}

function normalizeIso(value: unknown) {
  const normalized = normalizeText(value);
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeAnalyticsStore(input: Partial<AnalyticsStore>): AnalyticsStore {
  const pages = Object.fromEntries(
    Object.entries(input.pages ?? {}).map(([key, value]) => {
      const metric = value as Partial<AnalyticsPageMetric>;
      const pathValue = normalizePath(metric.path ?? key);

      return [
        pathValue,
        {
          path: pathValue,
          title: normalizeText(metric.title, pathValue),
          count: Number(metric.count ?? 0) || 0,
          lastViewedAt: normalizeIso(metric.lastViewedAt),
        } satisfies AnalyticsPageMetric,
      ];
    }),
  );

  const clicks = Object.fromEntries(
    Object.entries(input.clicks ?? {}).map(([key, value]) => {
      const metric = value as Partial<AnalyticsClickMetric>;
      const pathValue = normalizePath(metric.path);
      const label = normalizeText(metric.label, "Button");
      const href = normalizeText(metric.href);
      const metricKey = normalizeText(metric.key, key || `${pathValue}::${label}::${href}`);

      return [
        metricKey,
        {
          key: metricKey,
          path: pathValue,
          label,
          href,
          count: Number(metric.count ?? 0) || 0,
          lastClickedAt: normalizeIso(metric.lastClickedAt),
        } satisfies AnalyticsClickMetric,
      ];
    }),
  );

  const recentEvents = Array.isArray(input.recentEvents)
    ? input.recentEvents.slice(0, recentEventsLimit).map((event) => {
        const type: AnalyticsEvent["type"] = event?.type === "button_click" ? "button_click" : "pageview";

        return {
          type,
          path: normalizePath(event?.path),
          label: normalizeText(event?.label),
          href: normalizeText(event?.href),
          title: normalizeText(event?.title),
          at: normalizeIso(event?.at),
        } satisfies AnalyticsEvent;
      })
    : [];

  return {
    updatedAt: normalizeText(input.updatedAt),
    totals: {
      pageViews: Number(input.totals?.pageViews ?? 0) || 0,
      buttonClicks: Number(input.totals?.buttonClicks ?? 0) || 0,
    },
    pages,
    clicks,
    recentEvents,
  };
}

let writeQueue = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>) {
  const nextTask = writeQueue.then(task, task);
  writeQueue = nextTask.then(
    () => undefined,
    () => undefined,
  );
  return nextTask;
}

async function persistAnalyticsStore(store: AnalyticsStore) {
  await mkdir(path.dirname(analyticsPath), { recursive: true });
  await writeFile(analyticsPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function recordAnalyticsEvent(event: AnalyticsEvent) {
  return enqueueWrite(async () => {
    const store = await readAnalyticsStore();
    const at = normalizeIso(event.at);
    const pathValue = normalizePath(event.path);

    if (event.type === "pageview") {
      const existing = store.pages[pathValue];
      store.pages[pathValue] = {
        path: pathValue,
        title: normalizeText(event.title, existing?.title || pathValue),
        count: (existing?.count ?? 0) + 1,
        lastViewedAt: at,
      };
      store.totals.pageViews += 1;
    } else {
      const label = normalizeText(event.label, "Button");
      const href = normalizeText(event.href);
      if (!href) {
        return store;
      }

      const key = `${pathValue}::${label}::${href}`;
      const existing = store.clicks[key];
      store.clicks[key] = {
        key,
        path: pathValue,
        label,
        href,
        count: (existing?.count ?? 0) + 1,
        lastClickedAt: at,
      };
      store.totals.buttonClicks += 1;
    }

    store.updatedAt = at;
    store.recentEvents = [
      {
        type: event.type,
        path: pathValue,
        label: normalizeText(event.label),
        href: normalizeText(event.href),
        title: normalizeText(event.title),
        at,
      },
      ...store.recentEvents,
    ].slice(0, recentEventsLimit);

    await persistAnalyticsStore(store);
    return store;
  });
}

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  noStore();

  const store = await readAnalyticsStore();
  const pages = Object.values(store.pages).sort((left, right) => right.count - left.count);
  const clicks = Object.values(store.clicks).sort((left, right) => right.count - left.count);

  return {
    updatedAt: store.updatedAt,
    totals: {
      pageViews: store.totals.pageViews,
      buttonClicks: store.totals.buttonClicks,
      trackedPages: pages.length,
      trackedButtons: clicks.length,
    },
    pages,
    clicks,
    recentEvents: store.recentEvents,
  };
}
