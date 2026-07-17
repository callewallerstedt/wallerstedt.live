import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { NextResponse } from "next/server";
import { getAccountingDb } from "./db";
import { AccountingError } from "./errors";
import { assertSameOrigin } from "./http";

export const ACCOUNTING_SESSION_COOKIE = "__Host-accounting_session";
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 20 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

type SessionPayload = {
  v: 1;
  iat: number;
  exp: number;
  key: string;
  nonce: string;
};

type BrowserSecrets = {
  accessKey: string;
  password: string;
  sessionSecret: string;
};

function configured(name: string, minLength: number) {
  const value = process.env[name]?.trim() ?? "";
  if (value.length < minLength) {
    throw new AccountingError(
      `${name} is not securely configured.`,
      503,
      "accounting_not_configured",
    );
  }
  return value;
}

function browserSecrets(): BrowserSecrets {
  return {
    accessKey: configured("ACCOUNTING_ACCESS_KEY", 16),
    password: configured("ACCOUNTING_PASSWORD", 12),
    sessionSecret: configured("ACCOUNTING_SESSION_SECRET", 32),
  };
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant time even when strings have different lengths. */
export function secretEqual(actual: string, expected: string) {
  return timingSafeEqual(digest(actual), digest(expected));
}

function accessKeyDigest(accessKey: string) {
  return createHash("sha256").update(accessKey, "utf8").digest("base64url");
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

function parseCookies(header: string | null) {
  const result = new Map<string, string>();
  for (const item of (header ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const raw = item.slice(separator + 1).trim();
    try {
      result.set(name, decodeURIComponent(raw));
    } catch {
      // Ignore malformed cookies rather than reflecting their value.
    }
  }
  return result;
}

export function assertAccessKey(candidate: string) {
  const secrets = browserSecrets();
  if (!secretEqual(candidate, secrets.accessKey)) {
    throw new AccountingError("Not found.", 404, "not_found");
  }
  return secrets;
}

export function sessionRecordId(nonce: string) {
  return createHash("sha256").update(nonce, "utf8").digest("base64url");
}

function userAgentHash(request: Request, secret: string) {
  const value = request.headers.get("user-agent")?.slice(0, 1_000) ?? "";
  return value
    ? createHmac("sha256", secret).update(value, "utf8").digest("base64url")
    : null;
}

async function cleanupExpiredOwnerSessions(now: Date) {
  await getAccountingDb().accountingOwnerSession.deleteMany({
    where: { expiresAt: { lte: now } },
  });
}

export async function createSessionToken(
  accessKey: string,
  request: Request,
) {
  const secrets = assertAccessKey(accessKey);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(18).toString("base64url");
  const payload: SessionPayload = {
    v: 1,
    iat: now,
    exp: now + SESSION_LIFETIME_SECONDS,
    key: accessKeyDigest(secrets.accessKey),
    nonce,
  };
  const db = getAccountingDb();
  await cleanupExpiredOwnerSessions(new Date(now * 1_000));
  await db.accountingOwnerSession.create({
    data: {
      id: sessionRecordId(nonce),
      expiresAt: new Date(payload.exp * 1_000),
      lastUsedAt: new Date(now * 1_000),
      userAgentHash: userAgentHash(request, secrets.sessionSecret),
    },
  });
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secrets.sessionSecret)}`;
}

function decodeSessionToken(token: string, accessKey: string) {
  const secrets = assertAccessKey(accessKey);
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = sign(encoded, secrets.sessionSecret);
  if (!secretEqual(suppliedSignature, expectedSignature)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const valid =
    payload?.v === 1 &&
    Number.isSafeInteger(payload.iat) &&
    Number.isSafeInteger(payload.exp) &&
    payload.iat <= now + 60 &&
    payload.exp > now &&
    payload.exp - payload.iat <= SESSION_LIFETIME_SECONDS &&
    typeof payload.key === "string" &&
    typeof payload.nonce === "string" &&
    /^[A-Za-z0-9_-]{20,100}$/.test(payload.nonce) &&
    secretEqual(payload.key ?? "", accessKeyDigest(secrets.accessKey));
  return valid ? payload : null;
}

export function ownerSessionRecordIsActive(
  record: { expiresAt: Date; revokedAt: Date | null },
  tokenExpiresAtSeconds: number,
  now = new Date(),
) {
  return (
    !record.revokedAt &&
    record.expiresAt.getTime() > now.getTime() &&
    tokenExpiresAtSeconds * 1_000 > now.getTime()
  );
}

export async function requireOwnerSession(
  request: Request,
  accessKey: string,
  mutation = false,
) {
  const session = await getOwnerSession(request, accessKey);
  if (!session) {
    throw new AccountingError("Sign in is required.", 401, "unauthorized");
  }
  if (mutation) assertSameOrigin(request);
  return session;
}

async function getOwnerSession(request: Request, accessKey: string) {
  assertAccessKey(accessKey);
  const token = parseCookies(request.headers.get("cookie")).get(
    ACCOUNTING_SESSION_COOKIE,
  );
  if (!token) return null;
  const payload = decodeSessionToken(token, accessKey);
  if (!payload) return null;
  const id = sessionRecordId(payload.nonce);
  const db = getAccountingDb();
  const record = await db.accountingOwnerSession.findUnique({ where: { id } });
  const now = new Date();
  if (!record || !ownerSessionRecordIsActive(record, payload.exp, now)) {
    if (record && record.expiresAt <= now) {
      await db.accountingOwnerSession.delete({ where: { id } }).catch(() => undefined);
    }
    return null;
  }
  if (record.lastUsedAt.getTime() < now.getTime() - LAST_USED_WRITE_INTERVAL_MS) {
    await db.accountingOwnerSession.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastUsedAt: now },
    });
  }
  return { id, expiresAt: record.expiresAt };
}

export async function hasOwnerSession(request: Request, accessKey: string) {
  return Boolean(await getOwnerSession(request, accessKey));
}

export function currentSessionRevocationMutation(id: string, now = new Date()) {
  return {
    where: { id, revokedAt: null },
    data: { revokedAt: now, lastUsedAt: now },
  } as const;
}

export async function revokeCurrentOwnerSession(
  request: Request,
  accessKey: string,
) {
  const session = await requireOwnerSession(request, accessKey, true);
  const result = await getAccountingDb().accountingOwnerSession.updateMany({
    ...currentSessionRevocationMutation(session.id),
  });
  return result.count;
}

export async function revokeAllOwnerSessions(
  request: Request,
  accessKey: string,
) {
  await requireOwnerSession(request, accessKey, true);
  const now = new Date();
  const result = await getAccountingDb().accountingOwnerSession.updateMany({
    where: { revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now, lastUsedAt: now },
  });
  return result.count;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(ACCOUNTING_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
    priority: "high",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(ACCOUNTING_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    priority: "high",
  });
}

function requestIp(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  ).slice(0, 200);
}

function throttleId(request: Request, accessKey: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${requestIp(request)}\n${accessKeyDigest(accessKey)}`, "utf8")
    .digest("hex");
}

export async function authenticatePassword(
  request: Request,
  accessKey: string,
  suppliedPassword: string,
) {
  assertSameOrigin(request);
  const secrets = assertAccessKey(accessKey);
  const db = getAccountingDb();
  const id = throttleId(request, secrets.accessKey, secrets.sessionSecret);
  const now = new Date();
  const throttle = await db.accountingLoginThrottle.findUnique({ where: { id } });

  if (throttle?.lockedUntil && throttle.lockedUntil > now) {
    throw new AccountingError(
      "Too many sign-in attempts. Try again later.",
      429,
      "login_throttled",
      { retryAfterSeconds: Math.ceil((throttle.lockedUntil.getTime() - now.getTime()) / 1000) },
    );
  }

  const valid =
    suppliedPassword.length <= 4096 &&
    secretEqual(suppliedPassword, secrets.password);
  if (valid) {
    if (throttle) {
      await db.accountingLoginThrottle.delete({ where: { id } }).catch(() => undefined);
    }
    return createSessionToken(accessKey, request);
  }

  const withinWindow =
    throttle && now.getTime() - throttle.windowStartedAt.getTime() < LOGIN_WINDOW_MS;
  const failedCount = withinWindow ? throttle.failedCount + 1 : 1;
  const lockedUntil =
    failedCount >= MAX_LOGIN_FAILURES
      ? new Date(now.getTime() + LOGIN_LOCK_MS)
      : null;
  await db.accountingLoginThrottle.upsert({
    where: { id },
    create: {
      id,
      failedCount,
      windowStartedAt: now,
      lockedUntil,
      lastAttemptAt: now,
    },
    update: {
      failedCount,
      ...(withinWindow ? {} : { windowStartedAt: now }),
      lockedUntil,
      lastAttemptAt: now,
    },
  });

  throw new AccountingError("Invalid password.", 401, "invalid_credentials");
}

export function requireSyncToken(request: Request) {
  const expected = configured("ACCOUNTING_SYNC_TOKEN", 32);
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !secretEqual(match[1], expected)) {
    throw new AccountingError("Unauthorized.", 401, "unauthorized");
  }
}
