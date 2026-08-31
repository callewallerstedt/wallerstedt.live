import webpush from "web-push";
import type { AccountingEntry } from "@prisma/client";

import { getAccountingDb } from "./accounting/db";

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

export interface PostNotificationPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  removed: number;
}

export type AccountingPostNotificationInput = Pick<
  AccountingEntry,
  "id" | "description" | "amount" | "type"
>;

const GONE_PUSH_STATUS_CODES = new Set([404, 410]);
const emptyResult: PushSendResult = { sent: 0, failed: 0, removed: 0 };

function trimEnv(value: string | undefined) {
  return value?.trim() || "";
}

export function getSiteOrigin(environment: NodeJS.ProcessEnv = process.env) {
  return trimEnv(environment.NEXT_PUBLIC_SITE_URL) || DEFAULT_SITE_ORIGIN;
}

export function getAccountingAccessKey(environment: NodeJS.ProcessEnv = process.env) {
  return trimEnv(environment.ACCOUNTING_ACCESS_KEY);
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
  return Boolean(
    getVapidPublicKey(environment)
    && getVapidPrivateKey(environment)
    && getAccountingAccessKey(environment),
  );
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

export function formatAccountingAmount(amount: unknown) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
  }).format(numeric);
}

export function vaultPostPath(postId: string, accessKey = getAccountingAccessKey()) {
  const id = String(postId || "").trim();
  const key = encodeURIComponent(accessKey);
  if (!id || !key) {
    return "/vault/";
  }
  return `/vault/${key}?post=${encodeURIComponent(id)}`;
}

export function buildNewPostNotification(
  post: { id: string; description?: string | null; amount?: unknown; type?: string | null },
  options: { origin?: string; accessKey?: string } = {},
): PostNotificationPayload {
  const title = post.description?.trim() || "Ny bokföringspost";
  const amount = formatAccountingAmount(post.amount);
  const type = post.type?.trim() || "";
  const body = shortenNotificationBody([amount, type].filter(Boolean).join(" · ") || "En ny post har bokförts.");
  const origin = (options.origin ?? getSiteOrigin()).replace(/\/+$/, "");
  return {
    title,
    body,
    url: `${origin}${vaultPostPath(post.id, options.accessKey ?? getAccountingAccessKey())}`,
  };
}

export function buildNewPostsNotification(
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null }>,
  options: { origin?: string; accessKey?: string } = {},
): PostNotificationPayload | null {
  if (!posts.length) {
    return null;
  }
  if (posts.length === 1) {
    return buildNewPostNotification(posts[0], options);
  }
  const names = posts
    .map((post) => post.description?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  return {
    title: `${posts.length} nya poster`,
    body: shortenNotificationBody(names || "Nya bokföringsposter har sparats."),
    url: buildNewPostNotification(posts[0], options).url,
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

export async function savePushSubscription(subscription: StoredPushSubscription) {
  const db = getAccountingDb();
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
  const db = getAccountingDb();
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

async function sendPayload(payload: PostNotificationPayload): Promise<PushSendResult> {
  if (!isWebPushConfigured() || !configureWebPush()) {
    return emptyResult;
  }

  const db = getAccountingDb();
  const subscriptions = await db.webPushSubscription.findMany({
    select: { endpoint: true, p256dh: true, auth: true },
  });
  const result: PushSendResult = { sent: 0, failed: 0, removed: 0 };
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
        );
        result.sent += 1;
      } catch (error) {
        const statusCode =
          error && typeof error === "object" && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;
        if (isGonePushStatus(statusCode)) {
          await db.webPushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
          result.removed += 1;
          return;
        }
        result.failed += 1;
        console.error("Accounting web push send failed", statusCode ?? error);
      }
    }),
  );

  return result;
}

export async function notifyNewAccountingPosts(
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null }>,
): Promise<PushSendResult> {
  const payload = buildNewPostsNotification(posts);
  if (!payload) {
    return emptyResult;
  }
  return sendPayload(payload);
}

export async function notifyNewAccountingPost(
  post: { id: string; description?: string | null; amount?: unknown; type?: string | null },
): Promise<PushSendResult> {
  return notifyNewAccountingPosts([post]);
}

export async function safeNotifyNewAccountingPosts(
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null }>,
) {
  try {
    return await notifyNewAccountingPosts(posts);
  } catch (error) {
    console.error("Failed to send accounting push notifications", error);
    return emptyResult;
  }
}
