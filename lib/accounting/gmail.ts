import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { ImapFlow, MessageStructureObject } from "imapflow";
import { getAccountingDb } from "./db";
import {
  inspectDocumentBytes,
  uploadInspectedDocument,
} from "./documents";
import { AccountingError, redactedErrorDiagnostic } from "./errors";
import { serializeDocument } from "./serialize";

const MAX_GMAIL_ACCOUNTS = 4;
const MAX_BODY_CHARS = 20_000;
const MAX_TEXT_DOWNLOAD_BYTES = 600_000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type GmailMessageSummary = {
  account: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  attachments?: Array<Pick<GmailAttachmentInfo, "filename" | "mimeType" | "byteSize">>;
};

export type GmailAttachmentInfo = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
};

export function gmailConfigured() {
  const secret =
    process.env.ACCOUNTING_GMAIL_TOKEN_SECRET?.trim() ||
    process.env.ACCOUNTING_SESSION_SECRET?.trim();
  return Boolean(secret && secret.length >= 32);
}

function encryptionKey() {
  const secret =
    process.env.ACCOUNTING_GMAIL_TOKEN_SECRET?.trim() ||
    process.env.ACCOUNTING_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new AccountingError(
      "Gmail password storage is not configured.",
      503,
      "gmail_token_secret_missing",
    );
  }
  return createHash("sha256").update(`gmail-app-password:${secret}`).digest();
}

export function encryptGmailSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptGmailSecret(stored: string) {
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

function normalizeEmail(email: string) {
  const normalized = email.trim().toLocaleLowerCase("en");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AccountingError(
      "Ange en giltig Gmail-adress.",
      400,
      "gmail_invalid_email",
    );
  }
  return normalized;
}

function normalizeAppPassword(appPassword: string) {
  const normalized = appPassword.replace(/\s+/g, "");
  if (normalized.length < 12 || normalized.length > 64) {
    throw new AccountingError(
      "App-lösenordet ser inte rätt ut. Det är 16 tecken och skapas på myaccount.google.com/apppasswords.",
      400,
      "gmail_invalid_app_password",
    );
  }
  return normalized;
}

async function createImapClient(email: string, appPassword: string) {
  const { ImapFlow } = await import("imapflow");
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

function isAuthenticationFailure(error: unknown) {
  const record = error as { authenticationFailed?: boolean; response?: string; serverResponseCode?: string };
  return (
    record?.authenticationFailed === true ||
    /invalid credentials|authenticationfailed|application-specific password/i.test(
      String(record?.response ?? ""),
    )
  );
}

async function withImap<T>(
  email: string,
  appPassword: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  let client: ImapFlow;
  try {
    client = await createImapClient(email, appPassword);
    await client.connect();
  } catch (error) {
    if (isAuthenticationFailure(error)) {
      throw new AccountingError(
        `Gmail nekade inloggningen för ${email}. Kontrollera att app-lösenordet stämmer och fortfarande är aktivt.`,
        409,
        "gmail_auth_failed",
      );
    }
    console.error("Gmail IMAP connection failed", redactedErrorDiagnostic(error));
    throw new AccountingError(
      "Gmail kunde inte nås just nu. Försök igen.",
      502,
      "gmail_unreachable",
    );
  }
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

async function openAllMail(client: ImapFlow) {
  let path = "INBOX";
  try {
    const mailboxes = await client.list();
    const allMail = mailboxes.find((mailbox) => mailbox.specialUse === "\\All");
    if (allMail) path = allMail.path;
  } catch {
    // Fall back to INBOX when listing fails; searching still works there.
  }
  await client.mailboxOpen(path, { readOnly: true });
}

type StoredAccount = {
  id: string;
  email: string;
  secret: string;
};

async function withAccount<T>(
  account: StoredAccount,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const db = getAccountingDb();
  try {
    const result = await withImap(account.email, decryptGmailSecret(account.secret), fn);
    await db.accountingGmailAccount
      .update({
        where: { id: account.id },
        data: { status: "active", lastError: "", lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    return result;
  } catch (error) {
    if (
      error instanceof AccountingError &&
      ["gmail_auth_failed", "gmail_token_invalid"].includes(error.code)
    ) {
      await db.accountingGmailAccount
        .update({
          where: { id: account.id },
          data: { status: "reauth_required", lastError: error.code },
        })
        .catch(() => undefined);
      throw new AccountingError(
        `Åtkomsten till ${account.email} fungerar inte längre. Anslut kontot igen under Inställningar.`,
        409,
        "gmail_reauth_required",
      );
    }
    throw error;
  }
}

export async function addGmailAccount(email: string, appPassword: string) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizeAppPassword(appPassword);
  const db = getAccountingDb();
  const others = await db.accountingGmailAccount.count({
    where: { email: { not: normalizedEmail } },
  });
  if (others >= MAX_GMAIL_ACCOUNTS) {
    throw new AccountingError(
      `Högst ${MAX_GMAIL_ACCOUNTS} Gmail-konton kan vara anslutna samtidigt.`,
      409,
      "gmail_account_limit",
    );
  }
  // Prove the login works before anything is stored.
  await withImap(normalizedEmail, normalizedPassword, async (client) => {
    await openAllMail(client);
  });
  const encrypted = encryptGmailSecret(normalizedPassword);
  const account = await db.accountingGmailAccount.upsert({
    where: { email: normalizedEmail },
    create: { email: normalizedEmail, secret: encrypted, status: "active" },
    update: { secret: encrypted, status: "active", lastError: "" },
  });
  return serializeGmailAccount(account);
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

type AddressLike = { name?: string; address?: string };

function formatAddresses(addresses: AddressLike[] | undefined) {
  if (!addresses?.length) return "";
  return addresses
    .map((item) =>
      item.name && item.address
        ? `${item.name} <${item.address}>`
        : item.address ?? item.name ?? "",
    )
    .filter(Boolean)
    .join(", ");
}

function parseUid(messageId: string) {
  if (!/^\d{1,12}$/.test(messageId)) {
    throw new AccountingError(
      "The email id is invalid. Search again and use a returned messageId.",
      400,
      "gmail_invalid_message_id",
    );
  }
  return messageId;
}

function collectParts(
  node: MessageStructureObject | undefined,
  into: MessageStructureObject[],
) {
  if (!node) return;
  into.push(node);
  for (const child of node.childNodes ?? []) collectParts(child, into);
}

function decodeTextBuffer(buffer: Buffer, charset: string | undefined) {
  const normalized = (charset ?? "utf-8").toLocaleLowerCase("en");
  if (["iso-8859-1", "latin1", "windows-1252", "cp1252"].includes(normalized)) {
    return buffer.toString("latin1");
  }
  return buffer.toString("utf8");
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

function attachmentsFromStructure(
  structure: MessageStructureObject | undefined,
): GmailAttachmentInfo[] {
  const parts: MessageStructureObject[] = [];
  collectParts(structure, parts);
  return parts
    .filter((part) => {
      if (!part.part) return false;
      const filename =
        part.dispositionParameters?.filename ?? part.parameters?.name ?? "";
      return part.disposition?.toLocaleLowerCase("en") === "attachment" || Boolean(filename);
    })
    .filter((part) => !part.type?.startsWith("multipart/"))
    .map((part) => ({
      attachmentId: part.part!,
      filename:
        part.dispositionParameters?.filename ??
        part.parameters?.name ??
        `bilaga-${part.part}`,
      mimeType: part.type ?? "application/octet-stream",
      byteSize: part.size ?? 0,
    }));
}

async function downloadPart(
  client: ImapFlow,
  uid: string,
  part: string,
  maxBytes: number,
) {
  const download = await client.download(uid, part, { uid: true, maxBytes });
  if (!download?.content) {
    throw new AccountingError("The email or attachment was not found.", 404, "gmail_not_found");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of download.content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return { buffer: Buffer.concat(chunks), meta: download.meta };
}

const MAX_SNIPPET_CHARS = 320;
const MAX_SNIPPET_DOWNLOAD_BYTES = 16_000;

function findBodyPart(structure: MessageStructureObject | undefined) {
  const parts: MessageStructureObject[] = [];
  collectParts(structure, parts);
  const textPart =
    parts.find((part) => part.type === "text/plain" && part.part && !part.disposition) ??
    parts.find((part) => part.type === "text/plain" && part.part);
  const htmlPart =
    parts.find((part) => part.type === "text/html" && part.part && !part.disposition) ??
    parts.find((part) => part.type === "text/html" && part.part);
  const partId =
    textPart?.part ??
    htmlPart?.part ??
    (structure && !structure.childNodes ? "1" : null);
  return { textPart, htmlPart, partId };
}

async function fetchBodySnippet(
  client: ImapFlow,
  uid: string,
  structure: MessageStructureObject | undefined,
) {
  const { textPart, htmlPart, partId } = findBodyPart(structure);
  if (!partId) return "";
  try {
    const { buffer } = await downloadPart(client, uid, partId, MAX_SNIPPET_DOWNLOAD_BYTES);
    const charset = (textPart ?? htmlPart)?.parameters?.charset ?? structure?.parameters?.charset;
    const raw = decodeTextBuffer(buffer, charset);
    const text = textPart || !htmlPart ? raw : stripHtml(raw);
    return text.replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET_CHARS);
  } catch {
    return "";
  }
}

function summarize(
  account: string,
  message: {
    uid: number;
    threadId?: string;
    internalDate?: Date | string;
    envelope?: {
      from?: AddressLike[];
      to?: AddressLike[];
      subject?: string;
      date?: Date | string;
    };
  },
): GmailMessageSummary {
  const date = message.internalDate ?? message.envelope?.date;
  return {
    account,
    messageId: String(message.uid),
    threadId: message.threadId ?? "",
    from: formatAddresses(message.envelope?.from),
    to: formatAddresses(message.envelope?.to),
    subject: message.envelope?.subject ?? "",
    date: date ? new Date(date).toISOString() : "",
    snippet: "",
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
      const messages = await withAccount(account, async (client) => {
        await openAllMail(client);
        const uids = await client.search({ gmailraw: input.query }, { uid: true });
        if (!uids || !uids.length) return [];
        const newest = uids.sort((left, right) => right - left).slice(0, perAccount);
        const fetched = await client.fetchAll(
          newest,
          { uid: true, envelope: true, internalDate: true, threadId: true, bodyStructure: true },
          { uid: true },
        );
        const summaries: GmailMessageSummary[] = [];
        for (const message of fetched) {
          summaries.push({
            ...summarize(account.email, message),
            snippet: await fetchBodySnippet(client, String(message.uid), message.bodyStructure),
            attachments: attachmentsFromStructure(message.bodyStructure).map(
              ({ filename, mimeType, byteSize }) => ({ filename, mimeType, byteSize }),
            ),
          });
        }
        return summaries;
      });
      results.push(...messages);
      searchedAccounts.push({ email: account.email, found: messages.length });
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
  const uid = parseUid(messageId);
  return withAccount(account, async (client) => {
    await openAllMail(client);
    const message = await client.fetchOne(
      uid,
      { uid: true, envelope: true, internalDate: true, threadId: true, bodyStructure: true },
      { uid: true },
    );
    if (!message) {
      throw new AccountingError("The email was not found.", 404, "gmail_not_found");
    }
    const { textPart, htmlPart, partId: bodyPartId } = findBodyPart(message.bodyStructure);
    let bodyText = "";
    if (bodyPartId) {
      try {
        const { buffer } = await downloadPart(client, uid, bodyPartId, MAX_TEXT_DOWNLOAD_BYTES);
        const charset =
          (textPart ?? htmlPart)?.parameters?.charset ??
          message.bodyStructure?.parameters?.charset;
        const raw = decodeTextBuffer(buffer, charset);
        bodyText = (textPart || !htmlPart ? raw.trim() : stripHtml(raw)).slice(0, MAX_BODY_CHARS);
      } catch {
        bodyText = "";
      }
    }
    return {
      ...summarize(account.email, message),
      bodyText,
      attachments: attachmentsFromStructure(message.bodyStructure),
    };
  });
}

export async function fetchGmailAttachment(
  email: string,
  messageId: string,
  attachmentId: string,
) {
  const [account] = await resolveAccounts(email);
  const uid = parseUid(messageId);
  if (!/^[\d.]{1,20}$/.test(attachmentId)) {
    throw new AccountingError(
      "The attachment id is invalid. Use an attachmentId returned by read_email.",
      400,
      "gmail_invalid_attachment_id",
    );
  }
  return withAccount(account, async (client) => {
    await openAllMail(client);
    const { buffer, meta } = await downloadPart(
      client,
      uid,
      attachmentId,
      MAX_ATTACHMENT_BYTES + 1024,
    );
    if (!buffer.byteLength) {
      throw new AccountingError("The attachment is empty.", 404, "gmail_attachment_empty");
    }
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new AccountingError(
        "The attachment is larger than 10 MB.",
        413,
        "gmail_attachment_too_large",
      );
    }
    return { buffer, filename: meta.filename ?? "" };
  });
}

export async function importGmailAttachment(input: {
  account: string;
  messageId: string;
  attachmentId: string;
  filename: string;
  entryId: string | null;
}) {
  const { buffer, filename } = await fetchGmailAttachment(
    input.account,
    input.messageId,
    input.attachmentId,
  );
  let inspected;
  try {
    inspected = await inspectDocumentBytes(
      input.filename || filename || "gmail-bilaga",
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
