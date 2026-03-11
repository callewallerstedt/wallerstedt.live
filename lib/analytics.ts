import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";

import { hasPrismaDatabase, prisma } from "./prisma";

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
  source: "database" | "file";
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

interface AnalyticsCountRow {
  count: bigint | number;
}

interface AnalyticsPageRow {
  path: string;
  title: string;
  count: bigint | number;
  lastViewedAt: Date;
}

interface AnalyticsClickRow {
  path: string;
  label: string;
  href: string;
  count: bigint | number;
  lastClickedAt: Date;
}

interface AnalyticsRecentRow {
  type: string;
  path: string;
  label: string;
  href: string;
  title: string;
  createdAt: Date;
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

function createEmptySnapshot(source: AnalyticsSnapshot["source"]): AnalyticsSnapshot {
  return {
    source,
    updatedAt: "",
    totals: {
      pageViews: 0,
      buttonClicks: 0,
      trackedPages: 0,
      trackedButtons: 0,
    },
    pages: [],
    clicks: [],
    recentEvents: [],
  };
}

let ensureDatabasePromise: Promise<void> | null = null;

async function ensureAnalyticsTable() {
  if (!prisma) {
    return;
  }

  if (!ensureDatabasePromise) {
    ensureDatabasePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
          "id" TEXT PRIMARY KEY,
          "type" TEXT NOT NULL,
          "path" TEXT NOT NULL,
          "label" TEXT NOT NULL DEFAULT '',
          "href" TEXT NOT NULL DEFAULT '',
          "title" TEXT NOT NULL DEFAULT '',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AnalyticsEvent_type_createdAt_idx"
        ON "AnalyticsEvent" ("type", "createdAt")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AnalyticsEvent_path_createdAt_idx"
        ON "AnalyticsEvent" ("path", "createdAt")
      `);
    })().catch((error) => {
      ensureDatabasePromise = null;
      throw error;
    });
  }

  await ensureDatabasePromise;
}

async function readAnalyticsStore() {
  try {
    const raw = await readFile(analyticsPath, "utf8");
    return normalizeAnalyticsStore(JSON.parse(raw) as Partial<AnalyticsStore>);
  } catch {
    return createDefaultStore();
  }
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

async function recordAnalyticsEventInDatabase(event: AnalyticsEvent) {
  if (!prisma) {
    return;
  }

  await ensureAnalyticsTable();
  const at = normalizeIso(event.at);

  await prisma.analyticsEvent.create({
    data: {
      type: event.type,
      path: normalizePath(event.path),
      label: normalizeText(event.label),
      href: normalizeText(event.href),
      title: normalizeText(event.title),
      createdAt: new Date(at),
    },
  });
}

async function getAnalyticsSnapshotFromDatabase(): Promise<AnalyticsSnapshot> {
  if (!prisma) {
    return createEmptySnapshot("database");
  }

  await ensureAnalyticsTable();

  const [pageCountRows, buttonCountRows, pageRows, clickRows, recentRows]: [
    AnalyticsCountRow[],
    AnalyticsCountRow[],
    AnalyticsPageRow[],
    AnalyticsClickRow[],
    AnalyticsRecentRow[],
  ] = await Promise.all([
    prisma.$queryRaw<AnalyticsCountRow[]>`
      SELECT COUNT(*) AS count
      FROM "AnalyticsEvent"
      WHERE "type" = 'pageview'
    `,
    prisma.$queryRaw<AnalyticsCountRow[]>`
      SELECT COUNT(*) AS count
      FROM "AnalyticsEvent"
      WHERE "type" = 'button_click'
    `,
    prisma.$queryRaw<AnalyticsPageRow[]>`
      SELECT
        "path",
        COALESCE(NULLIF("title", ''), "path") AS "title",
        COUNT(*) AS count,
        MAX("createdAt") AS "lastViewedAt"
      FROM "AnalyticsEvent"
      WHERE "type" = 'pageview'
      GROUP BY "path", COALESCE(NULLIF("title", ''), "path")
      ORDER BY COUNT(*) DESC, MAX("createdAt") DESC
      LIMIT 50
    `,
    prisma.$queryRaw<AnalyticsClickRow[]>`
      SELECT
        "path",
        COALESCE(NULLIF("label", ''), 'Button') AS "label",
        "href",
        COUNT(*) AS count,
        MAX("createdAt") AS "lastClickedAt"
      FROM "AnalyticsEvent"
      WHERE "type" = 'button_click'
      GROUP BY "path", COALESCE(NULLIF("label", ''), 'Button'), "href"
      ORDER BY COUNT(*) DESC, MAX("createdAt") DESC
      LIMIT 50
    `,
    prisma.$queryRaw<AnalyticsRecentRow[]>`
      SELECT
        "type",
        "path",
        "label",
        "href",
        "title",
        "createdAt"
      FROM "AnalyticsEvent"
      ORDER BY "createdAt" DESC
      LIMIT ${recentEventsLimit}
    `,
  ]);

  const pageViews = Number(pageCountRows[0]?.count ?? 0);
  const buttonClicks = Number(buttonCountRows[0]?.count ?? 0);
  const pages = pageRows.map((row: AnalyticsPageRow) => ({
    path: normalizePath(row.path),
    title: normalizeText(row.title, normalizePath(row.path)),
    count: Number(row.count ?? 0),
    lastViewedAt: new Date(row.lastViewedAt).toISOString(),
  }));
  const clicks = clickRows.map((row: AnalyticsClickRow) => ({
    key: `${normalizePath(row.path)}::${normalizeText(row.label, "Button")}::${normalizeText(row.href)}`,
    path: normalizePath(row.path),
    label: normalizeText(row.label, "Button"),
    href: normalizeText(row.href),
    count: Number(row.count ?? 0),
    lastClickedAt: new Date(row.lastClickedAt).toISOString(),
  }));
  const recentEvents = recentRows.map((row: AnalyticsRecentRow) => ({
    type: row.type === "button_click" ? "button_click" : "pageview",
    path: normalizePath(row.path),
    label: normalizeText(row.label),
    href: normalizeText(row.href),
    title: normalizeText(row.title),
    at: new Date(row.createdAt).toISOString(),
  })) satisfies AnalyticsEvent[];

  return {
    source: "database",
    updatedAt: recentEvents[0]?.at ?? "",
    totals: {
      pageViews,
      buttonClicks,
      trackedPages: pages.length,
      trackedButtons: clicks.length,
    },
    pages,
    clicks,
    recentEvents,
  };
}

async function recordAnalyticsEventInFile(event: AnalyticsEvent) {
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

async function getAnalyticsSnapshotFromFile(): Promise<AnalyticsSnapshot> {
  const store = await readAnalyticsStore();
  const pages = Object.values(store.pages).sort((left, right) => right.count - left.count);
  const clicks = Object.values(store.clicks).sort((left, right) => right.count - left.count);

  return {
    source: "file",
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

export async function recordAnalyticsEvent(event: AnalyticsEvent) {
  if (hasPrismaDatabase()) {
    return recordAnalyticsEventInDatabase(event);
  }

  return recordAnalyticsEventInFile(event);
}

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  noStore();

  if (hasPrismaDatabase()) {
    return getAnalyticsSnapshotFromDatabase();
  }

  return getAnalyticsSnapshotFromFile();
}
