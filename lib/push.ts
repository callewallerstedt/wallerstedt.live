import webpush from "web-push";

import { hasPrismaDatabase, prisma } from "./prisma";
import type { Song } from "./site-data";

export const DEFAULT_SITE_ORIGIN = "https://wallerstedt.live";
export const NOTIFICATION_BODY_MAX_LENGTH = 110;

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface StoredPushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface SongNotificationPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  removed: number;
}

const GONE_PUSH_STATUS_CODES = new Set([404, 410]);

function trimEnv(value: string | undefined) {
  return value?.trim() || "";
}

export function getSiteOrigin(environment: NodeJS.ProcessEnv = process.env) {
  return trimEnv(environment.NEXT_PUBLIC_SITE_URL) || DEFAULT_SITE_ORIGIN;
}

export function getVapidPublicKey(environment: NodeJS.ProcessEnv = process.env) {
  return trimEnv(environment.NEXT_PUBLIC_VAPID_PUBLIC_KEY) || trimEnv(environment.VAPID_PUBLIC_KEY);
}

export function getVapidPrivateKey(environment: NodeJS.ProcessEnv = process.env) {
  return trimEnv(environment.VAPID_PRIVATE_KEY);
}

export function getVapidSubject(environment: NodeJS.ProcessEnv = process.env) {
  return trimEnv(environment.VAPID_SUBJECT) || "mailto:contact.wallerstedt@gmail.com";
}

export function isWebPushConfigured(environment: NodeJS.ProcessEnv = process.env) {
  return Boolean(getVapidPublicKey(environment) && getVapidPrivateKey(environment) && hasPrismaDatabase());
}

export function isGonePushStatus(statusCode: number | undefined) {
  return typeof statusCode === "number" && GONE_PUSH_STATUS_CODES.has(statusCode);
}

export function shortenNotificationBody(value: string, maxLength = NOTIFICATION_BODY_MAX_LENGTH) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildNewSongNotification(
  song: Pick<Song, "title" | "blurb" | "slug">,
  origin = getSiteOrigin(),
): SongNotificationPayload {
  const title = song.title.trim() || "Wallerstedt";
  const body = shortenNotificationBody(song.blurb?.trim() || "New piano music is out.");
  const path = `/${String(song.slug || "").replace(/^\/+/, "")}`;
  return {
    title,
    body,
    url: new URL(path, `${origin.replace(/\/+$/, "")}/`).toString(),
  };
}

function isHttpsEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isBase64UrlKey(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value) && value.length >= 8;
}

export function parsePushSubscription(input: unknown): StoredPushSubscription | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = typeof record.endpoint === "string" ? record.endpoint.trim() : "";
  const p256dh = typeof record.keys?.p256dh === "string" ? record.keys.p256dh.trim() : "";
  const auth = typeof record.keys?.auth === "string" ? record.keys.auth.trim() : "";

  if (!isHttpsEndpoint(endpoint) || !isBase64UrlKey(p256dh) || !isBase64UrlKey(auth)) {
    return null;
  }

  return { endpoint, keys: { p256dh, auth } };
}

function requirePushDatabase() {
  if (!prisma) {
    throw new Error("A Postgres database is required to store push subscriptions.");
  }
  return prisma;
}

export async function savePushSubscription(subscription: StoredPushSubscription) {
  const db = requirePushDatabase();
  await db.webPushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function deletePushSubscription(endpoint: string) {
  const db = requirePushDatabase();
  await db.webPushSubscription.deleteMany({
    where: { endpoint },
  });
}

function configureWebPush(environment: NodeJS.ProcessEnv = process.env) {
  const publicKey = getVapidPublicKey(environment);
  const privateKey = getVapidPrivateKey(environment);
  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(getVapidSubject(environment), publicKey, privateKey);
  return true;
}

async function removeGoneSubscription(endpoint: string) {
  if (!prisma) {
    return;
  }
  await prisma.webPushSubscription.deleteMany({ where: { endpoint } });
}

export async function notifyNewSong(song: Pick<Song, "title" | "blurb" | "slug">): Promise<PushSendResult> {
  const empty = { sent: 0, failed: 0, removed: 0 };
  if (!isWebPushConfigured() || !prisma) {
    return empty;
  }
  if (!configureWebPush()) {
    return empty;
  }

  const payload = JSON.stringify(buildNewSongNotification(song));
  const subscriptions = await prisma.webPushSubscription.findMany({
    select: { endpoint: true, p256dh: true, auth: true },
  });

  const result: PushSendResult = { sent: 0, failed: 0, removed: 0 };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        result.sent += 1;
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;
        if (isGonePushStatus(statusCode)) {
          await removeGoneSubscription(subscription.endpoint);
          result.removed += 1;
          return;
        }
        result.failed += 1;
        console.error("Web push send failed", statusCode ?? error);
      }
    }),
  );

  return result;
}
