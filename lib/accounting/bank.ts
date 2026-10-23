import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getAccountingDb } from "./db";
import { AccountingError } from "./errors";
import { formatCents, exactCents } from "./money";
import {
  createSession, deleteSession, enableBankingConfigured, EnableBankingError,
  getBalances, getTransactions, listAspsps, startAuthorization, type EbAccount,
  type PsuContext,
  type EbSession,
} from "../finance/enable-banking";

export const bankConnectSchema = z.object({ bank: z.string().trim().min(1).max(120), country: z.string().regex(/^[A-Z]{2}$/).default("SE") });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const storedAccounts = z.array(z.object({ uid: z.string().min(1), name: z.string().nullish(), currency: z.string().nullish(), account_id: z.unknown().optional() }).passthrough());

export function businessBankRedirectUrl() {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://wallerstedt.live");
  if (origin.protocol !== "https:") throw new AccountingError("Company bank callback requires HTTPS.", 503, "bank_callback_not_configured");
  // Reuse the callback already registered for the existing personal integration.
  // The namespaced, single-use state routes company consents independently.
  return `${origin.origin}/finance/callback`;
}

export async function businessBanks() {
  if (!enableBankingConfigured()) return [];
  const banks = await listAspsps("SE", "business");
  return banks.filter((bank) => !bank.psu_types || bank.psu_types.includes("business"));
}

export async function businessBankState() {
  const connections = await getAccountingDb().accountingBankConnection.findMany({
    orderBy: { createdAt: "desc" },
  });
  const lastAttempt = await getAccountingDb().accountingBankAuthState.findFirst({
    orderBy: { createdAt: "desc" }, select: { status: true, errorCode: true, errorStage: true, createdAt: true },
  });
  return { configured: enableBankingConfigured(), psuType: "business", callbackUrl: businessBankRedirectUrl(),
    lastAttempt,
    connections: connections.map((connection) => ({
      id: connection.id, bank: connection.bank, country: connection.country,
      status: connection.status === "active" && connection.validUntil <= new Date() ? "expired" : connection.status,
      validUntil: connection.validUntil.toISOString(), accounts: storedAccounts.parse(connection.accounts),
    })),
  };
}

export async function beginBusinessBankConnection(input: z.output<typeof bankConnectSchema>, psu?: PsuContext) {
  const banks = await listAspsps(input.country, "business");
  const bank = banks.find((bank) => bank.name === input.bank && bank.country === input.country && (!bank.psu_types || bank.psu_types.includes("business")));
  if (!bank) throw new AccountingError("Bank is not available for business access with this provider application.", 422, "business_bank_unavailable");
  const state = `company.${randomBytes(32).toString("base64url")}`;
  const now = Date.now();
  const validity = Math.min(bank.maximum_consent_validity ?? 86_400, 180 * 86_400);
  const validUntil = new Date(now + validity * 1_000 - 60_000);
  const db = getAccountingDb();
  await db.accountingBankAuthState.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  await db.accountingBankAuthState.create({ data: { id: hash(state), bank: input.bank, country: input.country, expiresAt: new Date(now + 30 * 60_000) } });
  try {
    const auth = await startAuthorization({ aspspName: input.bank, aspspCountry: input.country, state, redirectUrl: businessBankRedirectUrl(), validUntil, psuType: "business", psu });
    return { url: auth.url, validUntil: validUntil.toISOString(), requiresOwnerBankID: true, psuType: "business" };
  } catch (error) {
    await db.accountingBankAuthState.deleteMany({ where: { id: hash(state) } });
    throw error;
  }
}

export async function completeBusinessBankConnection(code: string, rawState: string, psu?: PsuContext) {
  if (!/^company\.[A-Za-z0-9_-]{43}$/.test(rawState) || !code || code.length > 4_000) throw new AccountingError("Invalid bank callback.", 400, "bank_state_invalid");
  const db = getAccountingDb();
  const state = await db.accountingBankAuthState.findUnique({ where: { id: hash(rawState) } });
  if (!state || state.expiresAt <= new Date()) throw new AccountingError("Bank connection expired. Start again.", 400, "bank_state_invalid");
  if (state.status === "completed" && state.connectionId) {
    const connection = await db.accountingBankConnection.findUnique({ where: { id: state.connectionId } });
    if (connection?.status === "active") return { accounts: storedAccounts.parse(connection.accounts).length, bank: connection.bank };
  }
  // Keep the expected consent and failure stage; deleting it before exchange made
  // every failure indistinguishable from an expired link and prevented recovery.
  const resumable = state.status === "failed" && state.errorStage === "persist" && state.session !== null;
  if (state.status === "failed" && !resumable) {
    throw new AccountingError("This consent attempt failed. Start a fresh consent.", 400, "business_bank_completion_failed", { stage: state.errorStage, reason: state.errorCode });
  }
  const claimed = await db.accountingBankAuthState.updateMany({
    where: { id: state.id, expiresAt: { gt: new Date() }, status: resumable ? "failed" : "pending" },
    data: { status: "processing", errorCode: null, errorStage: null },
  });
  if (claimed.count !== 1) throw new AccountingError("This bank callback is already being processed. Check connection status before restarting.", 409, "bank_callback_in_progress");
  let stage = "exchange";
  try {
    const session = resumable ? state.session as unknown as EbSession : await createSession(code, psu);
    if (!resumable) {
      stage = "persist_exchange";
      await db.accountingBankAuthState.update({ where: { id: state.id }, data: { session: session as unknown as Prisma.InputJsonValue } });
    }
    stage = "validate";
    const invalid = session.psu_type !== "business" ? "business_type_mismatch"
      : session.aspsp?.name !== state.bank || session.aspsp?.country !== state.country ? "bank_mismatch"
      : !session.accounts?.length ? "no_authorized_accounts"
      : !session.access?.valid_until ? "missing_consent_expiry" : null;
    if (invalid) {
      await deleteSession(session.session_id).catch(() => undefined);
      throw new AccountingError("Provider returned an invalid business consent.", 422, invalid);
    }
    const validUntil = new Date(session.access!.valid_until!);
    if (!Number.isFinite(validUntil.getTime()) || validUntil <= new Date()) {
      await deleteSession(session.session_id).catch(() => undefined);
      throw new AccountingError("Provider returned expired business consent.", 422, "expired_business_consent");
    }
    storedAccounts.parse(session.accounts);
    stage = "persist";
    await db.$transaction(async (tx) => {
      await tx.accountingBankConnection.upsert({ where: { id: session.session_id },
        create: { id: session.session_id, bank: state.bank, country: state.country, validUntil, accounts: session.accounts as unknown as Prisma.InputJsonValue },
        update: { status: "active", validUntil, accounts: session.accounts as unknown as Prisma.InputJsonValue },
      });
      await tx.accountingBankAuthState.update({ where: { id: state.id }, data: { status: "completed", connectionId: session.session_id, session: Prisma.DbNull } });
    });
    return { accounts: session.accounts.length, bank: state.bank };
  } catch (error) {
    const diagnostic = completionDiagnostic(error, stage);
    await db.accountingBankAuthState.updateMany({ where: { id: state.id }, data: { status: "failed", errorCode: diagnostic.reason, errorStage: diagnostic.stage } }).catch(() => undefined);
    throw new AccountingError("Company bank consent could not be completed.", error instanceof AccountingError ? error.status : 502, "business_bank_completion_failed", diagnostic);
  }
}

/** Strictly bounded codes only: never upstream messages, account IDs, codes or tokens. */
export function completionDiagnostic(error: unknown, stage = "callback") {
  const code = error instanceof EnableBankingError ? error.ebCode : error instanceof AccountingError ? error.code : error instanceof z.ZodError ? "invalid_provider_response" : "internal_error";
  return { stage, reason: /^[a-zA-Z0-9_\-]{1,80}$/.test(code) ? code : "upstream_error", ...(error instanceof EnableBankingError ? { bankStatus: error.httpStatus } : {}) };
}

export async function disconnectBusinessBank(id: string) {
  const db = getAccountingDb();
  const connection = await db.accountingBankConnection.findUnique({ where: { id } });
  if (!connection) throw new AccountingError("Business connection not found.", 404, "bank_connection_not_found");
  // Do not claim revocation succeeded when the provider could not be reached.
  await deleteSession(id);
  await db.accountingBankConnection.update({ where: { id }, data: { status: "revoked" } });
}

async function companyAccount(uid: string): Promise<{ account: EbAccount; connectionId: string }> {
  const connections = await getAccountingDb().accountingBankConnection.findMany({ where: { status: "active", validUntil: { gt: new Date() } } });
  for (const connection of connections) {
    const account = storedAccounts.parse(connection.accounts).find((account) => account.uid === uid);
    if (account) return { account: account as EbAccount, connectionId: connection.id };
  }
  throw new AccountingError("Account is not part of an active company consent. Reconnect if expired.", 404, "business_account_not_found");
}

async function bankRead<T>(connectionId: string, read: () => Promise<T>) {
  try { return await read(); } catch (error) {
    if (error instanceof EnableBankingError && error.sessionExpired) {
      await getAccountingDb().accountingBankConnection.updateMany({ where: { id: connectionId }, data: { status: "expired" } });
    }
    throw error;
  }
}

export async function businessBalances(uid: string) {
  const { account, connectionId } = await companyAccount(uid);
  const balances = await bankRead(connectionId, () => getBalances(uid));
  return { account, balances, fetchedAt: new Date().toISOString(),
    note: "Provider snapshot. Preserve balance type, currency and reference date. Available balance may include overdraft and differs from booked ledger balance. Unattended provider limits apply.",
  };
}

export async function businessTransactions(uid: string, dateFrom: string, dateTo: string) {
  const { account, connectionId } = await companyAccount(uid);
  const rows = await bankRead(connectionId, () => getTransactions(uid, dateFrom, undefined, dateTo));
  return { account, fetchedAt: new Date().toISOString(), complete: true,
    transactions: rows.map((row) => {
      const amount = exactCents(row.transaction_amount.amount);
      const signed = row.credit_debit_indicator === "DBIT" ? -(amount < 0n ? -amount : amount) : row.credit_debit_indicator === "CRDT" ? (amount < 0n ? -amount : amount) : null;
      return { bankTransactionId: row.transaction_id || row.entry_reference || null, date: row.booking_date ?? row.value_date ?? null,
        amount: signed === null ? null : formatCents(signed), currency: row.transaction_amount.currency, status: row.status ?? null,
        description: row.remittance_information?.join(" ") ?? "", raw: row,
      };
    }),
    note: "Read-only source evidence. No automatic ledger posting. Missing stable transaction ID, direction, booking date, non-SEK or pending rows require review. History completeness is limited to what the bank provides for this consent.",
  };
}
