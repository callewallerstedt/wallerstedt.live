import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getAccountingDb } from "./db";
import {
  inspectDocumentBytes,
  uploadInspectedDocument,
} from "./documents";
import { AccountingError, redactedErrorDiagnostic } from "./errors";
import { serializeDocument } from "./serialize";

export const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_STATE_COOKIE = "accounting_gmail_oauth_state";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_GMAIL_ACCOUNTS = 4;
const MAX_BODY_CHARS = 20_000;

export type GmailMessageSummary = {
  account: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
};

export type GmailAttachmentInfo = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
};

export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

function gmailOauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new AccountingError(
      "Gmail is not configured on the server yet.",
      503,
      "gmail_not_configured",
    );
  }
  return { clientId, clientSecret };
}

function encryptionKey() {
  const secret =
    process.env.ACCOUNTING_GMAIL_TOKEN_SECRET?.trim() ||
    process.env.ACCOUNTING_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new AccountingError(
      "Gmail token storage is not configured.",
      503,
      "gmail_token_secret_missing",
    );
  }
  return createHash("sha256").update(`gmail-refresh-token:${secret}`).digest();
}

export function encryptGmailToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptGmailToken(stored: string) {
  const [version, iv, tag, data, ...rest] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data || rest.length) {
    throw new AccountingError(
      "The stored Gmail connection is invalid. Reconnect the account.",
      409,
      "gmail_token_invalid",
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AccountingError(
      "The stored Gmail connection could not be read. Reconnect the account.",
      409,
      "gmail_token_invalid",
    );
  }
}

export function buildGmailAuthUrl(redirectUri: string, state: string) {
  const { clientId } = gmailOauthConfig();
  const parameters = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${parameters.toString()}`;
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function requestGoogleToken(body: URLSearchParams) {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch {
    throw new AccountingError(
      "Google could not be reached. Try again.",
      502,
      "gmail_google_unreachable",
    );
  }
  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok) {
    const error = new AccountingError(
      "Google rejected the Gmail authorization.",
      response.status === 400 || response.status === 401 ? 409 : 502,
      payload.error === "invalid_grant" ? "gmail_invalid_grant" : "gmail_token_error",
    );
    console.error("Gmail token request failed", {
      status: response.status,
      error: payload.error ?? null,
    });
    throw error;
  }
  return payload;
}

export async function exchangeGmailCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = gmailOauthConfig();
  const tokens = await requestGoogleToken(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new AccountingError(
      "Google did not return a usable Gmail authorization. Remove the app's access at myaccount.google.com/permissions and connect again.",
      409,
      "gmail_missing_refresh_token",
    );
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope ?? "",
  };
}

export async function fetchGmailProfileEmail(accessToken: string) {
  let response: Response;
  try {
    response = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new AccountingError("Gmail could not be reached. Try again.", 502, "gmail_unreachable");
  }
  const payload = (await response.json().catch(() => ({}))) as { emailAddress?: string };
  if (!response.ok || !payload.emailAddress) {
    throw new AccountingError(
      "Google did not report which Gmail account was connected.",
      502,
      "gmail_profile_missing",
    );
  }
  return payload.emailAddress;
}

const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessTokenFor(account: { id: string; email: string; refreshToken: string }) {
  const cached = accessTokenCache.get(account.email);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const { clientId, clientSecret } = gmailOauthConfig();
  const db = getAccountingDb();
  let tokens: GoogleTokenResponse;
  try {
    tokens = await requestGoogleToken(
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: decryptGmailToken(account.refreshToken),
        grant_type: "refresh_token",
      }),
    );
  } catch (error) {
    if (
      error instanceof AccountingError &&
      ["gmail_invalid_grant", "gmail_token_invalid"].includes(error.code ?? "")
    ) {
      await db.accountingGmailAccount
        .update({
          where: { id: account.id },
          data: { status: "reauth_required", lastError: error.code ?? "invalid_grant" },
        })
        .catch(() => undefined);
      throw new AccountingError(
        `Access to ${account.email} has expired. Reconnect the account under Settings.`,
        409,
        "gmail_reauth_required",
      );
    }
    throw error;
  }
  if (!tokens.access_token) {
    throw new AccountingError(
      "Google did not return a Gmail access token.",
      502,
      "gmail_token_error",
    );
  }
  accessTokenCache.set(account.email, {
    token: tokens.access_token,
    expiresAt: Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000,
  });
  await db.accountingGmailAccount
    .update({
      where: { id: account.id },
      data: { status: "active", lastError: "", lastUsedAt: new Date() },
    })
    .catch(() => undefined);
  return tokens.access_token;
}

export async function upsertGmailAccount(email: string, refreshToken: string, scopes: string) {
  const normalized = email.trim().toLocaleLowerCase("en");
  if (!normalized || !normalized.includes("@")) {
    throw new AccountingError("Google did not report an email address.", 502, "gmail_profile_missing");
  }
  const db = getAccountingDb();
  const existing = await db.accountingGmailAccount.count({
    where: { email: { not: normalized } },
  });
  if (existing >= MAX_GMAIL_ACCOUNTS) {
    throw new AccountingError(
      `At most ${MAX_GMAIL_ACCOUNTS} Gmail accounts can be connected.`,
      409,
      "gmail_account_limit",
    );
  }
  accessTokenCache.delete(normalized);
  const encrypted = encryptGmailToken(refreshToken);
  return db.accountingGmailAccount.upsert({
    where: { email: normalized },
    create: { email: normalized, refreshToken: encrypted, scopes, status: "active" },
    update: { refreshToken: encrypted, scopes, status: "active", lastError: "" },
  });
}

export function serializeGmailAccount(account: {
  id: string;
  email: string;
  status: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: account.id,
    email: account.email,
    status: account.status,
    lastUsedAt: account.lastUsedAt?.toISOString() ?? null,
    connectedAt: account.createdAt.toISOString(),
  };
}

export async function listGmailAccounts() {
  const accounts = await getAccountingDb().accountingGmailAccount.findMany({
    orderBy: { createdAt: "asc" },
  });
  return accounts.map(serializeGmailAccount);
}

export async function disconnectGmailAccount(id: string) {
  const db = getAccountingDb();
  const account = await db.accountingGmailAccount.findUnique({ where: { id } });
  if (!account) {
    throw new AccountingError("The Gmail account was not found.", 404, "gmail_account_not_found");
  }
  accessTokenCache.delete(account.email);
  await db.accountingGmailAccount.delete({ where: { id } });
  return serializeGmailAccount(account);
}

async function resolveAccounts(email: string | null) {
  const db = getAccountingDb();
  const accounts = await db.accountingGmailAccount.findMany({
    where: email ? { email: email.trim().toLocaleLowerCase("en") } : {},
    orderBy: { createdAt: "asc" },
  });
  if (!accounts.length) {
    throw new AccountingError(
      email
        ? `No connected Gmail account matches ${email}. Use one of the connected accounts.`
        : "No Gmail account is connected yet. Connect one under Settings.",
      404,
      "gmail_account_not_found",
    );
  }
  return accounts;
}

async function gmailFetch(
  account: { id: string; email: string; refreshToken: string },
  path: string,
) {
  const token = await accessTokenFor(account);
  let response: Response;
  try {
    response = await fetch(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new AccountingError("Gmail could not be reached. Try again.", 502, "gmail_unreachable");
  }
  if (response.status === 401 || response.status === 403) {
    accessTokenCache.delete(account.email);
    throw new AccountingError(
      `Gmail denied access for ${account.email}. Reconnect the account under Settings.`,
      409,
      "gmail_reauth_required",
    );
  }
  if (response.status === 404) {
    throw new AccountingError("The email or attachment was not found.", 404, "gmail_not_found");
  }
  if (!response.ok) {
    console.error("Gmail API error", { status: response.status, path: path.split("?")[0] });
    throw new AccountingError("Gmail returned an error. Try again.", 502, "gmail_api_error");
  }
  return response.json() as Promise<Record<string, unknown>>;
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  partId?: string;
  filename?: string;
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};

function header(headers: GmailHeader[] | undefined, name: string) {
  return (
    headers?.find((item) => item.name?.toLocaleLowerCase("en") === name)?.value ?? ""
  );
}

function decodeBody(data: string | undefined) {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectParts(part: GmailPart | undefined, into: GmailPart[]) {
  if (!part) return;
  into.push(part);
  for (const child of part.parts ?? []) collectParts(child, into);
}

function extractBodyText(payload: GmailPart | undefined) {
  const parts: GmailPart[] = [];
  collectParts(payload, parts);
  const plain = parts
    .filter((part) => part.mimeType === "text/plain" && part.body?.data)
    .map((part) => decodeBody(part.body?.data))
    .join("\n")
    .trim();
  if (plain) return plain.slice(0, MAX_BODY_CHARS);
  const html = parts
    .filter((part) => part.mimeType === "text/html" && part.body?.data)
    .map((part) => decodeBody(part.body?.data))
    .join("\n");
  return stripHtml(html).slice(0, MAX_BODY_CHARS);
}

function extractAttachments(payload: GmailPart | undefined): GmailAttachmentInfo[] {
  const parts: GmailPart[] = [];
  collectParts(payload, parts);
  return parts
    .filter((part) => part.filename && part.body?.attachmentId)
    .map((part) => ({
      attachmentId: part.body!.attachmentId!,
      filename: part.filename!,
      mimeType: part.mimeType ?? "application/octet-stream",
      byteSize: part.body?.size ?? 0,
    }));
}

function summarizeMessage(account: string, message: Record<string, unknown>): GmailMessageSummary {
  const payload = message.payload as GmailPart | undefined;
  const internalDate = Number(message.internalDate ?? 0);
  return {
    account,
    messageId: String(message.id ?? ""),
    threadId: String(message.threadId ?? ""),
    from: header(payload?.headers, "from"),
    to: header(payload?.headers, "to"),
    subject: header(payload?.headers, "subject"),
    date: internalDate
      ? new Date(internalDate).toISOString()
      : header(payload?.headers, "date"),
    snippet: String(message.snippet ?? ""),
  };
}

export async function searchGmail(input: {
  account: string | null;
  query: string;
  maxResults: number;
}) {
  const accounts = await resolveAccounts(input.account);
  const perAccount = Math.max(1, Math.min(input.maxResults, 25));
  const results: GmailMessageSummary[] = [];
  const searchedAccounts: Array<{ email: string; found: number; error?: string }> = [];
  for (const account of accounts) {
    try {
      const list = await gmailFetch(
        account,
        `/messages?q=${encodeURIComponent(input.query)}&maxResults=${perAccount}`,
      );
      const ids = Array.isArray(list.messages)
        ? (list.messages as Array<{ id?: string }>).map((item) => item.id).filter(Boolean)
        : [];
      for (const id of ids as string[]) {
        const message = await gmailFetch(
          account,
          `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        );
        results.push(summarizeMessage(account.email, message));
      }
      searchedAccounts.push({ email: account.email, found: ids.length });
    } catch (error) {
      if (error instanceof AccountingError && error.code === "gmail_reauth_required") {
        searchedAccounts.push({ email: account.email, found: 0, error: error.message });
        continue;
      }
      throw error;
    }
  }
  results.sort((left, right) => (left.date < right.date ? 1 : -1));
  return { accounts: searchedAccounts, messages: results };
}

export async function readGmailMessage(email: string, messageId: string) {
  const [account] = await resolveAccounts(email);
  const message = await gmailFetch(
    account,
    `/messages/${encodeURIComponent(messageId)}?format=full`,
  );
  const payload = message.payload as GmailPart | undefined;
  return {
    ...summarizeMessage(account.email, message),
    bodyText: extractBodyText(payload),
    attachments: extractAttachments(payload),
  };
}

export async function fetchGmailAttachment(
  email: string,
  messageId: string,
  attachmentId: string,
) {
  const [account] = await resolveAccounts(email);
  const attachment = await gmailFetch(
    account,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  const data = typeof attachment.data === "string" ? attachment.data : "";
  if (!data) {
    throw new AccountingError("The attachment is empty.", 404, "gmail_attachment_empty");
  }
  return Buffer.from(data, "base64url");
}

export async function importGmailAttachment(input: {
  account: string;
  messageId: string;
  attachmentId: string;
  filename: string;
  entryId: string | null;
}) {
  const buffer = await fetchGmailAttachment(
    input.account,
    input.messageId,
    input.attachmentId,
  );
  let inspected;
  try {
    inspected = await inspectDocumentBytes(
      input.filename || "gmail-bilaga",
      "application/octet-stream",
      buffer,
    );
  } catch (error) {
    if (error instanceof AccountingError) throw error;
    console.error("Gmail attachment inspection failed", redactedErrorDiagnostic(error));
    throw new AccountingError(
      "The attachment could not be read as a document.",
      415,
      "gmail_attachment_unsupported",
    );
  }
  const document = await uploadInspectedDocument(
    inspected,
    input.entryId,
    "web-ai-agent-gmail",
  );
  return serializeDocument(document);
}
