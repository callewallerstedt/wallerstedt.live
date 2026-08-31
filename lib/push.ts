import webpush from "web-push";
import type { AccountingEntry } from "@prisma/client";

import { getAccountingDb } from "./accounting/db";

export const DEFAULT_SITE_ORIGIN = "https://wallerstedt.live";
export const NOTIFICATION_BODY_MAX_LENGTH = 110;
export const ACCOUNTING_PUSH_OPEN_MESSAGE = "open-accounting-post";
export const ACCOUNTING_PUSH_PENDING_CACHE = "wallerstedt-accounting-push-open";
export const ACCOUNTING_PUSH_PENDING_PATH = "/__accounting-pending-open";
export const ACCOUNTING_PUSH_LAST_PATH = "/__accounting-last-push";

export const LEDGER_POST_ACTIONS = ["create", "update", "delete", "restore", "status"] as const;
export type LedgerPostAction = (typeof LEDGER_POST_ACTIONS)[number];

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
  postId: string;
  action: LedgerPostAction;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  removed: number;
}

export type AccountingPostNotificationInput = Pick<
  AccountingEntry,
  "id" | "description" | "amount" | "type" | "status"
>;

const GONE_PUSH_STATUS_CODES = new Set([404, 410]);
const emptyResult: PushSendResult = { sent: 0, failed: 0, removed: 0 };

const ACTION_COPY: Record<LedgerPostAction, { title: string; manyTitle: (count: number) => string; fallbackBody: string }> = {
  create: {
    title: "Ny post",
    manyTitle: (count) => `${count} nya poster`,
    fallbackBody: "En ny post har bokförts.",
  },
  update: {
    title: "Ändrad",
    manyTitle: (count) => `${count} ändrade poster`,
    fallbackBody: "En post har ändrats.",
  },
  delete: {
    title: "Raderad",
    manyTitle: (count) => `${count} raderade poster`,
    fallbackBody: "En post har tagits bort.",
  },
  restore: {
    title: "Återställd",
    manyTitle: (count) => `${count} återställda poster`,
    fallbackBody: "En post har återställts.",
  },
  status: {
    title: "Ändrad status",
    manyTitle: (count) => `${count} poster med ny status`,
    fallbackBody: "Statusen på en post har ändrats.",
  },
};

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

export function isLedgerPostAction(value: unknown): value is LedgerPostAction {
  return typeof value === "string" && (LEDGER_POST_ACTIONS as readonly string[]).includes(value);
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

export function postIdFromNotificationUrl(url: string) {
  try {
    return new URL(url, DEFAULT_SITE_ORIGIN).searchParams.get("post")?.trim() || "";
  } catch {
    return "";
  }
}

export function parseAccountingPushOpen(input: unknown): PostNotificationPayload | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as {
    title?: unknown;
    body?: unknown;
    url?: unknown;
    postId?: unknown;
    action?: unknown;
  };
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const postId = (typeof record.postId === "string" ? record.postId.trim() : "")
    || postIdFromNotificationUrl(url);
  if (!url && !postId) {
    return null;
  }
  const action = isLedgerPostAction(record.action) ? record.action : "create";
  const copy = ACTION_COPY[action];
  return {
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : copy.title,
    body: typeof record.body === "string" ? record.body : copy.fallbackBody,
    url: url || vaultPostPath(postId),
    postId,
    action,
  };
}

function notificationBody(
  action: LedgerPostAction,
  post: { description?: string | null; amount?: unknown; type?: string | null; status?: string | null },
) {
  const description = post.description?.trim() || "";
  const amount = formatAccountingAmount(post.amount);
  const type = post.type?.trim() || "";
  const status = action === "status" ? post.status?.trim() || "" : "";
  const details = [description, amount, type, status].filter(Boolean).join(" · ");
  return shortenNotificationBody(details || ACTION_COPY[action].fallbackBody);
}

export function buildPostNotification(
  action: LedgerPostAction,
  post: { id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null },
  options: { origin?: string; accessKey?: string } = {},
): PostNotificationPayload {
  const origin = (options.origin ?? getSiteOrigin()).replace(/\/+$/, "");
  const postId = String(post.id || "").trim();
  return {
    title: ACTION_COPY[action].title,
    body: notificationBody(action, post),
    url: `${origin}${vaultPostPath(postId, options.accessKey ?? getAccountingAccessKey())}`,
    postId,
    action,
  };
}

export function buildPostsNotification(
  action: LedgerPostAction,
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null }>,
  options: { origin?: string; accessKey?: string } = {},
): PostNotificationPayload | null {
  if (!posts.length) {
    return null;
  }
  if (posts.length === 1) {
    return buildPostNotification(action, posts[0], options);
  }
  const names = posts
    .map((post) => post.description?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  const first = buildPostNotification(action, posts[0], options);
  return {
    title: ACTION_COPY[action].manyTitle(posts.length),
    body: shortenNotificationBody(names || ACTION_COPY[action].fallbackBody),
    url: first.url,
    postId: first.postId,
    action,
  };
}

export function buildNewPostNotification(
  post: { id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null },
  options: { origin?: string; accessKey?: string } = {},
): PostNotificationPayload {
  return buildPostNotification("create", post, options);
}

export function buildNewPostsNotification(
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null }>,
  options: { origin?: string; accessKey?: string } = {},
): PostNotificationPayload | null {
  return buildPostsNotification("create", posts, options);
}

const STATUS_ONLY_KEYS = new Set(["status", "updatedAt", "createdAt", "legacyId"]);

export function classifyEntryPatch(
  input: Record<string, unknown> | null | undefined,
): Extract<LedgerPostAction, "update" | "status"> {
  if (!input) {
    return "update";
  }
  const meaningful = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .filter((key) => !STATUS_ONLY_KEYS.has(key));
  if (meaningful.length === 0 && input.status !== undefined) {
    return "status";
  }
  return "update";
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

export async function notifyAccountingPosts(
  action: LedgerPostAction,
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null }>,
): Promise<PushSendResult> {
  const payload = buildPostsNotification(action, posts);
  if (!payload) {
    return emptyResult;
  }
  return sendPayload(payload);
}

export async function notifyAccountingPost(
  action: LedgerPostAction,
  post: { id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null },
): Promise<PushSendResult> {
  return notifyAccountingPosts(action, [post]);
}

export async function safeNotifyAccountingPosts(
  action: LedgerPostAction,
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null }>,
) {
  try {
    return await notifyAccountingPosts(action, posts);
  } catch (error) {
    console.error("Failed to send accounting push notifications", error);
    return emptyResult;
  }
}

export async function notifyNewAccountingPosts(
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null }>,
): Promise<PushSendResult> {
  return notifyAccountingPosts("create", posts);
}

export async function notifyNewAccountingPost(
  post: { id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null },
): Promise<PushSendResult> {
  return notifyAccountingPosts("create", [post]);
}

export async function safeNotifyNewAccountingPosts(
  posts: Array<{ id: string; description?: string | null; amount?: unknown; type?: string | null; status?: string | null }>,
) {
  return safeNotifyAccountingPosts("create", posts);
}
