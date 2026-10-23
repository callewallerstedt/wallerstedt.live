import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "./prisma";

/**
 * Release-update signups. Postgres when a database is configured (production),
 * a JSON file otherwise — Vercel's filesystem is read-only, so the file is only
 * a local-dev fallback.
 */
const subscribersPath = path.join(process.cwd(), "data", "subscribers.json");

export interface Subscriber {
  email: string;
  createdAt: string;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

let ensureTablePromise: Promise<void> | null = null;

async function ensureSubscriberTable() {
  if (!prisma) {
    return;
  }

  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SiteSubscriber" (
          "email" TEXT PRIMARY KEY,
          "source" TEXT NOT NULL DEFAULT '',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  await ensureTablePromise;
}

async function readFileSubscribers() {
  try {
    const raw = await readFile(subscribersPath, "utf8");
    return JSON.parse(raw) as Subscriber[];
  } catch {
    return [];
  }
}

export async function getSubscribers(): Promise<Subscriber[]> {
  if (prisma) {
    await ensureSubscriberTable();
    const rows = await prisma.$queryRaw<Array<{ email: string; createdAt: Date }>>`
      SELECT "email", "createdAt" FROM "SiteSubscriber" ORDER BY "createdAt" DESC
    `;
    return rows.map((row) => ({ email: row.email, createdAt: row.createdAt.toISOString() }));
  }

  return readFileSubscribers();
}

export async function addSubscriber(emailInput: string, source = "") {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) {
    return { ok: false as const, message: "That email doesn't look right." };
  }

  if (prisma) {
    try {
      await ensureSubscriberTable();
      const inserted = await prisma.$executeRaw`
        INSERT INTO "SiteSubscriber" ("email", "source") VALUES (${email}, ${source.slice(0, 80)})
        ON CONFLICT ("email") DO NOTHING
      `;
      return { ok: true as const, message: inserted ? "You're in. Thanks!" : "You're already on the list." };
    } catch (error) {
      console.error("[subscribers] insert failed", error);
      return { ok: false as const, message: "Something went wrong. Try again in a bit." };
    }
  }

  const subscribers = await readFileSubscribers();
  if (subscribers.some((subscriber) => subscriber.email === email)) {
    return { ok: true as const, message: "You're already on the list." };
  }

  subscribers.push({
    email,
    createdAt: new Date().toISOString(),
  });

  await mkdir(path.dirname(subscribersPath), { recursive: true });
  await writeFile(subscribersPath, `${JSON.stringify(subscribers, null, 2)}\n`, "utf8");

  return { ok: true as const, message: "You're in. Thanks!" };
}
