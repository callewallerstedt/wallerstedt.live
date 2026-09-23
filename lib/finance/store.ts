import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError } from "@/lib/accounting/errors";
import { berlinYmd } from "@/lib/os/format";

import { categorize, findTransferPairs, isCategoryId, normalizeMerchant } from "./categories";
import {
  amountToCents,
  createSession,
  deleteSession,
  EnableBankingError,
  enableBankingConfigured,
  getBalances,
  getTransactions,
  listAspsps,
  pickBalance,
  startAuthorization,
  type EbTransaction,
  type PsuContext,
} from "./enable-banking";
import { FINANCE_SCHEMA_SQL } from "./schema-sql";
import { buildSavingsTips, suggestBudgets } from "./tips";

export const DEFAULT_ASPSP = { name: "Handelsbanken", country: "SE" };
export const FINANCE_CALLBACK_PATH = "/finance/callback";
/** PSD2 caps consents at 180 days; the bank may cap it lower. */
const MAX_CONSENT_DAYS = 180;
const FIRST_SYNC_DAYS = 730;
const FALLBACK_SYNC_DAYS = 89;
const RESYNC_OVERLAP_DAYS = 14;

let schemaReady: Promise<void> | null = null;

/** Create the finance tables if the migration has not been applied yet. */
export function ensureFinanceSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getAccountingDb();
      for (const statement of FINANCE_SCHEMA_SQL) {
        await db.$executeRawUnsafe(statement);
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function db() {
  await ensureFinanceSchema();
  return getAccountingDb();
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromYmd(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDaysYmd(value: string, days: number) {
  const date = dateFromYmd(value);
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date);
}

function todayYmd() {
  return berlinYmd() ?? ymd(new Date());
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://wallerstedt.live").replace(/\/+$/, "");
}

export function financeRedirectUrl() {
  return `${siteOrigin()}${FINANCE_CALLBACK_PATH}`;
}

/* ------------------------------------------------------------------------ */
/* Connecting a bank                                                          */
/* ------------------------------------------------------------------------ */

export async function listBanks(country = "SE") {
  const aspsps = await listAspsps(country);
  return aspsps
    .map((aspsp) => ({
      name: aspsp.name,
      country: aspsp.country,
      logo: aspsp.logo ?? null,
      maxConsentDays: aspsp.maximum_consent_validity
        ? Math.floor(aspsp.maximum_consent_validity / 86_400)
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

/** Start the BankID flow. Returns the bank URL the browser should open. */
export async function beginBankConnection(input: { aspspName?: string; aspspCountry?: string; psu?: PsuContext }) {
  const client = await db();
  const aspspName = input.aspspName?.trim() || DEFAULT_ASPSP.name;
  const aspspCountry = (input.aspspCountry?.trim() || DEFAULT_ASPSP.country).toUpperCase();

  let consentDays = MAX_CONSENT_DAYS;
  try {
    const aspsps = await listAspsps(aspspCountry);
    const match = aspsps.find((aspsp) => aspsp.name.toLowerCase() === aspspName.toLowerCase());
    if (match?.maximum_consent_validity) {
      consentDays = Math.min(consentDays, Math.floor(match.maximum_consent_validity / 86_400));
    }
  } catch {
    // The list is only used to size the consent; the bank enforces its own cap.
  }

  const state = randomBytes(24).toString("base64url");
  const now = Date.now();
  await client.financeAuthState.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  await client.financeAuthState.create({
    data: { id: state, aspspName, aspspCountry, expiresAt: new Date(now + 30 * 60_000) },
  });
  const validUntil = new Date(now + Math.max(1, consentDays) * 86_400_000 - 60_000);
  const auth = await startAuthorization({
    aspspName,
    aspspCountry,
    state,
    redirectUrl: financeRedirectUrl(),
    validUntil,
    psu: input.psu,
  });
  return { url: auth.url, aspspName, aspspCountry, validUntil: validUntil.toISOString() };
}

/** The bank redirected back with ?code&state. Swap the code for a session. */
export async function completeBankConnection(input: { code: string; state: string; psu?: PsuContext }) {
  const client = await db();
  const state = await client.financeAuthState.findUnique({ where: { id: input.state } });
  if (!state || state.expiresAt.getTime() < Date.now()) {
    throw new AccountingError("That bank link has expired. Start again from the Privat tab.", 400, "finance_state_invalid");
  }
  await client.financeAuthState.delete({ where: { id: state.id } }).catch(() => undefined);

  const session = await createSession(input.code, input.psu);
  const validUntil = session.access?.valid_until ? new Date(session.access.valid_until) : null;
  await client.financeBankSession.upsert({
    where: { id: session.session_id },
    create: {
      id: session.session_id,
      aspspName: session.aspsp?.name ?? state.aspspName,
      aspspCountry: session.aspsp?.country ?? state.aspspCountry,
      status: "active",
      validUntil,
    },
    update: { status: "active", validUntil, lastError: "" },
  });

  const aspspName = session.aspsp?.name ?? state.aspspName;
  const seen = new Set<string>();
  for (const account of session.accounts ?? []) {
    seen.add(account.uid);
    const iban = account.account_id?.iban ?? account.account_id?.other?.identification ?? "";
    await client.financeAccount.upsert({
      where: { id: account.uid },
      create: {
        id: account.uid,
        sessionId: session.session_id,
        aspspName,
        iban,
        bankName: account.name ?? account.details ?? account.product ?? "",
        product: account.product ?? account.cash_account_type ?? "",
        currency: account.currency ?? "SEK",
        active: true,
      },
      update: {
        sessionId: session.session_id,
        aspspName,
        iban,
        bankName: account.name ?? account.details ?? account.product ?? "",
        product: account.product ?? account.cash_account_type ?? "",
        currency: account.currency ?? "SEK",
        active: true,
        lastError: "",
      },
    });
  }

  // A reconnect to the same bank replaces the old consent.
  const older = await client.financeBankSession.findMany({
    where: { aspspName, id: { not: session.session_id }, status: "active" },
  });
  for (const old of older) {
    await client.financeBankSession.update({ where: { id: old.id }, data: { status: "replaced" } });
    await deleteSession(old.id).catch(() => undefined);
  }
  await client.financeAccount.updateMany({
    where: { aspspName, id: { notIn: [...seen] } },
    data: { active: false },
  });

  return { sessionId: session.session_id, accounts: session.accounts?.length ?? 0, aspspName };
}

export async function disconnectBank(sessionId: string) {
  const client = await db();
  await deleteSession(sessionId).catch(() => undefined);
  await client.financeBankSession.updateMany({ where: { id: sessionId }, data: { status: "revoked" } });
  await client.financeAccount.updateMany({ where: { sessionId }, data: { active: false } });
}

/* ------------------------------------------------------------------------ */
/* Sync                                                                       */
/* ------------------------------------------------------------------------ */

type MappedTransaction = {
  id: string;
  accountId: string;
  bookingDate: string;
  amountCents: number;
  currency: string;
  status: string;
  counterparty: string;
  description: string;
  merchant: string;
  raw: EbTransaction;
};

export function mapTransactions(accountId: string, rows: EbTransaction[]): MappedTransaction[] {
  const occurrences = new Map<string, number>();
  const mapped: MappedTransaction[] = [];
  for (const row of rows) {
    const date = row.booking_date || row.value_date || row.transaction_date;
    if (!date) continue;
    let cents = amountToCents(row.transaction_amount?.amount ?? 0);
    if (row.credit_debit_indicator === "DBIT" && cents > 0) cents = -cents;
    if (row.credit_debit_indicator === "CRDT" && cents < 0) cents = -cents;
    const status = row.status === "PDNG" ? "PDNG" : "BOOK";
    const counterparty =
      (cents < 0 ? row.creditor?.name : row.debtor?.name) ?? row.creditor?.name ?? row.debtor?.name ?? "";
    const remittance = (row.remittance_information ?? []).filter(Boolean).join(" ").trim();
    const description = (remittance || row.bank_transaction_code?.description || row.note || counterparty || "").slice(0, 500);
    const merchant = normalizeMerchant(counterparty || description) || normalizeMerchant(description);
    const bankId = row.transaction_id || row.entry_reference;
    let id: string;
    if (bankId && status === "BOOK") {
      id = `${accountId}:${bankId}`;
    } else {
      const base = `${accountId}|${status}|${date.slice(0, 10)}|${cents}|${description}|${counterparty}`;
      const count = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, count);
      id = `${accountId}:h${createHash("sha256").update(`${base}|${count}`).digest("base64url").slice(0, 32)}`;
    }
    mapped.push({
      id,
      accountId,
      bookingDate: date.slice(0, 10),
      amountCents: cents,
      currency: row.transaction_amount?.currency ?? "SEK",
      status,
      counterparty: counterparty.slice(0, 200),
      description,
      merchant,
      raw: row,
    });
  }
  return mapped;
}

export type SyncResult = {
  ok: boolean;
  skipped?: string;
  accounts: number;
  newTransactions: number;
  errors: string[];
  needsReconnect: boolean;
  at: string;
};

const MIN_SYNC_GAP_MS = 5 * 60_000;

export async function syncFinance({ psu, force = false }: { psu?: PsuContext; force?: boolean } = {}): Promise<SyncResult> {
  const client = await db();
  const at = new Date().toISOString();
  if (!enableBankingConfigured()) {
    return { ok: false, skipped: "not_configured", accounts: 0, newTransactions: 0, errors: [], needsReconnect: false, at };
  }
  if (!force) {
    const meta = await client.financeMeta.findUnique({ where: { key: "lastSync" } });
    const last = (meta?.value as { at?: string } | null)?.at;
    if (last && Date.now() - new Date(last).getTime() < MIN_SYNC_GAP_MS) {
      return { ok: true, skipped: "recent", accounts: 0, newTransactions: 0, errors: [], needsReconnect: false, at: last };
    }
  }

  const sessions = await client.financeBankSession.findMany({ where: { status: "active" } });
  const now = Date.now();
  for (const session of sessions) {
    if (session.validUntil && session.validUntil.getTime() < now) {
      await client.financeBankSession.update({ where: { id: session.id }, data: { status: "expired" } });
    }
  }
  const activeSessionIds = sessions
    .filter((session) => !session.validUntil || session.validUntil.getTime() >= now)
    .map((session) => session.id);
  const accounts = await client.financeAccount.findMany({
    where: { active: true, sessionId: { in: activeSessionIds } },
  });

  const rules = new Map(
    (await client.financeCategoryRule.findMany()).map((rule) => [rule.merchant, rule.category]),
  );
  const errors: string[] = [];
  let needsReconnect = false;
  let newTransactions = 0;
  const today = todayYmd();

  for (const account of accounts) {
    const label = account.displayName || account.bankName || account.iban || account.id;
    try {
      const balances = await getBalances(account.id, psu);
      const balance = pickBalance(balances);
      if (balance) {
        await client.financeAccount.update({
          where: { id: account.id },
          data: {
            balanceCents: BigInt(amountToCents(balance.balance_amount.amount)),
            balanceType: balance.balance_type ?? "",
            balanceAt: new Date(),
            currency: balance.balance_amount.currency || account.currency,
          },
        });
      }

      const latest = await client.financeTransaction.findFirst({
        where: { accountId: account.id, status: "BOOK" },
        orderBy: { bookingDate: "desc" },
        select: { bookingDate: true },
      });
      let dateFrom = latest
        ? addDaysYmd(ymd(latest.bookingDate), -RESYNC_OVERLAP_DAYS)
        : addDaysYmd(today, -FIRST_SYNC_DAYS);
      let raw: EbTransaction[];
      try {
        raw = await getTransactions(account.id, dateFrom, psu);
      } catch (error) {
        if (!(error instanceof EnableBankingError) || error.sessionExpired || error.rateLimited) throw error;
        // Banks often refuse history older than 90 days outside a fresh BankID login.
        dateFrom = addDaysYmd(today, -FALLBACK_SYNC_DAYS);
        raw = await getTransactions(account.id, dateFrom, psu);
      }
      const mapped = mapTransactions(account.id, raw);

      // Pending lines get new ids once booked, so replace them wholesale.
      await client.financeTransaction.deleteMany({
        where: { accountId: account.id, status: "PDNG", bookingDate: { gte: dateFromYmd(dateFrom) } },
      });
      const existing = new Set(
        (
          await client.financeTransaction.findMany({
            where: { id: { in: mapped.map((row) => row.id) } },
            select: { id: true },
          })
        ).map((row) => row.id),
      );
      const fresh = mapped.filter((row) => !existing.has(row.id));
      if (fresh.length) {
        const created = await client.financeTransaction.createMany({
          skipDuplicates: true,
          data: fresh.map((row) => {
            const ruled = row.merchant ? rules.get(row.merchant) : undefined;
            const category = ruled ?? categorize({ text: `${row.counterparty} ${row.description}`, amountCents: row.amountCents });
            return {
              id: row.id,
              accountId: row.accountId,
              bookingDate: dateFromYmd(row.bookingDate),
              amountCents: row.amountCents,
              currency: row.currency,
              status: row.status,
              counterparty: row.counterparty,
              description: row.description,
              merchant: row.merchant,
              category,
              categorySource: ruled ? "rule" : "auto",
              isTransfer: category === "transfer",
              raw: row.raw as object,
            };
          }),
        });
        newTransactions += created.count;
      }
      await client.financeAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), lastError: "" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${label}: ${message}`);
      await client.financeAccount.update({ where: { id: account.id }, data: { lastError: message.slice(0, 500) } });
      if (error instanceof EnableBankingError && error.sessionExpired) {
        needsReconnect = true;
        await client.financeBankSession.updateMany({
          where: { id: account.sessionId },
          data: { status: "expired", lastError: message.slice(0, 500) },
        });
      }
    }
  }

  await markTransfers();
  await writeSnapshot();

  const result: SyncResult = {
    ok: errors.length === 0,
    accounts: accounts.length,
    newTransactions,
    errors,
    needsReconnect,
    at: new Date().toISOString(),
  };
  await client.financeMeta.upsert({
    where: { key: "lastSync" },
    create: { key: "lastSync", value: result },
    update: { value: result },
  });
  return result;
}

/** Pair opposite-signed equal amounts across own accounts and call them transfers. */
async function markTransfers() {
  const client = await db();
  const since = dateFromYmd(addDaysYmd(todayYmd(), -FIRST_SYNC_DAYS));
  const rows = await client.financeTransaction.findMany({
    where: { bookingDate: { gte: since }, categorySource: { not: "manual" }, isTransfer: false },
    select: { id: true, accountId: true, amountCents: true, bookingDate: true },
  });
  const pairs = findTransferPairs(
    rows.map((row) => ({ ...row, day: Math.round(row.bookingDate.getTime() / 86_400_000) })),
  );
  if (pairs.size) {
    await client.financeTransaction.updateMany({
      where: { id: { in: [...pairs] } },
      data: { isTransfer: true, category: "transfer", categorySource: "auto" },
    });
  }
}

async function writeSnapshot() {
  const client = await db();
  const [accounts, assets] = await Promise.all([
    client.financeAccount.findMany({ where: { active: true, hidden: false } }),
    client.financeAsset.findMany(),
  ]);
  const bankCents = accounts.reduce((sum, account) => sum + (account.balanceCents ?? BigInt(0)), BigInt(0));
  const assetsCents = assets.reduce((sum, asset) => sum + asset.valueCents, BigInt(0));
  const day = dateFromYmd(todayYmd());
  await client.financeSnapshot.upsert({
    where: { day },
    create: { day, bankCents, assetsCents },
    update: { bankCents, assetsCents },
  });
}

/* ------------------------------------------------------------------------ */
/* Edits                                                                      */
/* ------------------------------------------------------------------------ */

export async function setTransactionCategory(input: {
  id: string;
  category?: string;
  note?: string;
  applyToMerchant?: boolean;
}) {
  const client = await db();
  const row = await client.financeTransaction.findUnique({ where: { id: input.id } });
  if (!row) throw new AccountingError("Transaction not found.", 404, "not_found");
  const data: { category?: string; categorySource?: string; isTransfer?: boolean; note?: string } = {};
  if (input.category !== undefined) {
    if (!isCategoryId(input.category)) throw new AccountingError("Unknown category.", 400, "invalid_category");
    data.category = input.category;
    data.categorySource = "manual";
    data.isTransfer = input.category === "transfer";
  }
  if (input.note !== undefined) data.note = input.note.slice(0, 1000);
  const updated = await client.financeTransaction.update({ where: { id: row.id }, data });
  let applied = 0;
  if (input.applyToMerchant && input.category && row.merchant) {
    await client.financeCategoryRule.upsert({
      where: { merchant: row.merchant },
      create: { merchant: row.merchant, category: input.category },
      update: { category: input.category },
    });
    const result = await client.financeTransaction.updateMany({
      where: { merchant: row.merchant, categorySource: { not: "manual" } },
      data: { category: input.category, categorySource: "rule", isTransfer: input.category === "transfer" },
    });
    applied = result.count;
  }
  return { transaction: serializeTransaction(updated), appliedToOthers: applied };
}

export async function listRules() {
  const client = await db();
  return client.financeCategoryRule.findMany({ orderBy: { merchant: "asc" } });
}

export async function deleteRule(merchant: string) {
  const client = await db();
  await client.financeCategoryRule.deleteMany({ where: { merchant } });
  const rows = await client.financeTransaction.findMany({
    where: { merchant, categorySource: "rule" },
    select: { id: true, counterparty: true, description: true, amountCents: true },
  });
  for (const row of rows) {
    const category = categorize({ text: `${row.counterparty} ${row.description}`, amountCents: row.amountCents });
    await client.financeTransaction.update({
      where: { id: row.id },
      data: { category, categorySource: "auto", isTransfer: category === "transfer" },
    });
  }
}

export async function listBudgets() {
  const client = await db();
  const rows = await client.financeBudget.findMany();
  return rows.map((row) => ({ category: row.category, monthlyCents: row.monthlyCents }));
}

/** Replace some budgets. A value of 0 or null removes that category's budget. */
export async function setBudgets(entries: Array<{ category: string; monthlyCents: number | null }>) {
  const client = await db();
  for (const entry of entries) {
    if (!isCategoryId(entry.category)) throw new AccountingError(`Unknown category ${entry.category}.`, 400, "invalid_category");
    if (!entry.monthlyCents || entry.monthlyCents <= 0) {
      await client.financeBudget.deleteMany({ where: { category: entry.category } });
    } else {
      const monthlyCents = Math.round(Math.min(entry.monthlyCents, 1_000_000_000));
      await client.financeBudget.upsert({
        where: { category: entry.category },
        create: { category: entry.category, monthlyCents },
        update: { monthlyCents },
      });
    }
  }
  return listBudgets();
}

export async function updateAccount(id: string, input: { displayName?: string; hidden?: boolean }) {
  const client = await db();
  const data: { displayName?: string; hidden?: boolean } = {};
  if (input.displayName !== undefined) data.displayName = input.displayName.trim().slice(0, 80);
  if (input.hidden !== undefined) data.hidden = input.hidden;
  const account = await client.financeAccount.update({ where: { id }, data }).catch(() => null);
  if (!account) throw new AccountingError("Account not found.", 404, "not_found");
  await writeSnapshot();
  return serializeAccount(account);
}

const ASSET_KINDS = ["investment", "savings", "crypto", "property", "vehicle", "debt", "other"] as const;

export async function listAssets() {
  const client = await db();
  const rows = await client.financeAsset.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(serializeAsset);
}

export async function upsertAsset(input: { id?: string; name?: string; kind?: string; valueCents?: number; note?: string }) {
  const client = await db();
  const kind = ASSET_KINDS.includes(input.kind as never) ? input.kind! : undefined;
  const value =
    input.valueCents === undefined
      ? undefined
      : BigInt(Math.round((kind ?? "") === "debt" ? -Math.abs(input.valueCents) : input.valueCents));
  let row;
  if (input.id) {
    row = await client.financeAsset
      .update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim().slice(0, 80) } : {}),
          ...(kind ? { kind } : {}),
          ...(value !== undefined ? { valueCents: value } : {}),
          ...(input.note !== undefined ? { note: input.note.slice(0, 500) } : {}),
        },
      })
      .catch(() => null);
    if (!row) throw new AccountingError("Asset not found.", 404, "not_found");
  } else {
    if (!input.name?.trim()) throw new AccountingError("Name is required.", 400, "invalid_asset");
    row = await client.financeAsset.create({
      data: {
        id: randomUUID(),
        name: input.name.trim().slice(0, 80),
        kind: kind ?? "investment",
        valueCents: value ?? BigInt(0),
        note: input.note?.slice(0, 500) ?? "",
      },
    });
  }
  await writeSnapshot();
  return serializeAsset(row);
}

export async function deleteAsset(id: string) {
  const client = await db();
  await client.financeAsset.deleteMany({ where: { id } });
  await writeSnapshot();
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                    */
/* ------------------------------------------------------------------------ */

type AccountRow = Awaited<ReturnType<ReturnType<typeof getAccountingDb>["financeAccount"]["findMany"]>>[number];
type TxRow = Awaited<ReturnType<ReturnType<typeof getAccountingDb>["financeTransaction"]["findMany"]>>[number];
type AssetRow = Awaited<ReturnType<ReturnType<typeof getAccountingDb>["financeAsset"]["findMany"]>>[number];

export function serializeAccount(account: AccountRow) {
  return {
    id: account.id,
    name: account.displayName || account.bankName || account.product || "Account",
    bankName: account.bankName,
    displayName: account.displayName,
    bank: account.aspspName,
    iban: account.iban,
    product: account.product,
    currency: account.currency,
    balanceCents: account.balanceCents == null ? null : Number(account.balanceCents),
    balanceType: account.balanceType,
    balanceAt: account.balanceAt?.toISOString() ?? null,
    hidden: account.hidden,
    active: account.active,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastError: account.lastError || null,
  };
}

export function serializeTransaction(row: TxRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    date: ymd(row.bookingDate),
    amountCents: row.amountCents,
    currency: row.currency,
    pending: row.status === "PDNG",
    counterparty: row.counterparty,
    description: row.description,
    merchant: row.merchant,
    category: row.category,
    categorySource: row.categorySource,
    isTransfer: row.isTransfer,
    note: row.note,
  };
}

export function serializeAsset(row: AssetRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    valueCents: Number(row.valueCents),
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type FinanceTransactionView = ReturnType<typeof serializeTransaction>;

export async function listTransactions(input: {
  month?: string;
  from?: string;
  to?: string;
  category?: string;
  accountId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const client = await db();
  const where: Record<string, unknown> = {};
  let from = input.from;
  let to = input.to;
  if (input.month && /^\d{4}-\d{2}$/.test(input.month)) {
    from = `${input.month}-01`;
    to = monthEnd(input.month);
  }
  if (from || to) {
    where.bookingDate = {
      ...(from ? { gte: dateFromYmd(from) } : {}),
      ...(to ? { lte: dateFromYmd(to) } : {}),
    };
  }
  if (input.category) where.category = input.category;
  if (input.accountId) where.accountId = input.accountId;
  if (input.q?.trim()) {
    const q = input.q.trim().slice(0, 100);
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { counterparty: { contains: q, mode: "insensitive" } },
      { merchant: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
    ];
  }
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);
  const [rows, total] = await Promise.all([
    client.financeTransaction.findMany({
      where,
      orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: Math.max(input.offset ?? 0, 0),
    }),
    client.financeTransaction.count({ where }),
  ]);
  return { total, transactions: rows.map(serializeTransaction) };
}

function monthEnd(month: string) {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year!, m!, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, m! - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export async function getConnectionState() {
  const client = await db();
  const sessions = await client.financeBankSession.findMany({ orderBy: { createdAt: "desc" } });
  const now = Date.now();
  const current = sessions
    .filter((session) => session.status === "active" || session.status === "expired")
    .map((session) => {
      const expired =
        session.status === "expired" || (session.validUntil ? session.validUntil.getTime() < now : false);
      const daysLeft = session.validUntil
        ? Math.max(0, Math.floor((session.validUntil.getTime() - now) / 86_400_000))
        : null;
      return {
        id: session.id,
        bank: session.aspspName,
        country: session.aspspCountry,
        status: expired ? "expired" : "active",
        validUntil: session.validUntil?.toISOString() ?? null,
        daysLeft,
        lastError: session.lastError || null,
      };
    });
  // One entry per bank: the newest.
  const byBank = new Map<string, (typeof current)[number]>();
  for (const session of current) if (!byBank.has(session.bank)) byBank.set(session.bank, session);
  const banks = [...byBank.values()];
  return {
    configured: enableBankingConfigured(),
    banks,
    needsConnect: !banks.some((bank) => bank.status === "active"),
    expiringSoon: banks.some((bank) => bank.status === "active" && bank.daysLeft != null && bank.daysLeft <= 14),
  };
}

export async function getFinanceSummary(requestedMonth?: string) {
  const client = await db();
  const today = todayYmd();
  const currentMonth = today.slice(0, 7);
  const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : currentMonth;
  const historyStart = shiftMonth(currentMonth, -12);
  const windowStart = month < historyStart ? month : historyStart;

  const [accountsRaw, assetsRaw, budgetsRaw, txRaw, snapshots, lastSyncMeta, connection, earliest] = await Promise.all([
    client.financeAccount.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    client.financeAsset.findMany({ orderBy: { createdAt: "asc" } }),
    client.financeBudget.findMany(),
    client.financeTransaction.findMany({
      where: { bookingDate: { gte: dateFromYmd(`${windowStart}-01`) } },
      orderBy: { bookingDate: "asc" },
    }),
    client.financeSnapshot.findMany({ orderBy: { day: "asc" } }),
    client.financeMeta.findUnique({ where: { key: "lastSync" } }),
    getConnectionState(),
    client.financeTransaction.findFirst({ orderBy: { bookingDate: "asc" }, select: { bookingDate: true } }),
  ]);

  const accounts = accountsRaw.map(serializeAccount);
  const assets = assetsRaw.map(serializeAsset);
  const visibleAccountIds = new Set(accounts.filter((account) => !account.hidden).map((account) => account.id));
  const bankCents = accounts
    .filter((account) => !account.hidden)
    .reduce((sum, account) => sum + (account.balanceCents ?? 0), 0);
  const assetsCents = assets.reduce((sum, asset) => sum + asset.valueCents, 0);
  const budgets = new Map(budgetsRaw.map((row) => [row.category, row.monthlyCents]));

  const tx = txRaw.filter((row) => visibleAccountIds.has(row.accountId)).map(serializeTransaction);
  const monthKeyOf = (row: FinanceTransactionView) => row.date.slice(0, 7);
  const spendOf = (row: FinanceTransactionView) => {
    const category = row.category;
    if (row.isTransfer || category === "transfer" || category === "savings" || category === "income") return 0;
    // Money out is positive spending; a refund in a spending category reduces it.
    return -row.amountCents;
  };
  const incomeOf = (row: FinanceTransactionView) => (row.category === "income" && !row.isTransfer ? row.amountCents : 0);
  const savedOf = (row: FinanceTransactionView) => (row.category === "savings" ? -row.amountCents : 0);

  // Month buckets for the last 13 months (and the selected one).
  const months: string[] = [];
  for (let i = 12; i >= 0; i -= 1) months.push(shiftMonth(currentMonth, -i));
  if (!months.includes(month)) months.unshift(month);
  type Bucket = { income: number; spending: number; saved: number; byCategory: Map<string, number>; count: number };
  const buckets = new Map<string, Bucket>(
    months.map((key) => [key, { income: 0, spending: 0, saved: 0, byCategory: new Map(), count: 0 }]),
  );
  for (const row of tx) {
    const bucket = buckets.get(monthKeyOf(row));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.income += incomeOf(row);
    bucket.saved += savedOf(row);
    const spend = spendOf(row);
    if (spend !== 0) {
      bucket.spending += spend;
      bucket.byCategory.set(row.category, (bucket.byCategory.get(row.category) ?? 0) + spend);
    }
  }

  const firstDataMonth = earliest ? ymd(earliest.bookingDate).slice(0, 7) : currentMonth;
  // Averages use full months with data before the selected month (max six).
  const averageMonths: string[] = [];
  for (let i = 1; i <= 6; i += 1) {
    const key = shiftMonth(month, -i);
    if (key < firstDataMonth || !buckets.has(key)) break;
    // The first month with data is usually partial: skip it.
    if (key === firstDataMonth) break;
    averageMonths.push(key);
  }
  const avgOf = (pick: (bucket: Bucket) => number) =>
    averageMonths.length
      ? Math.round(averageMonths.reduce((sum, key) => sum + pick(buckets.get(key)!), 0) / averageMonths.length)
      : null;

  const selected = buckets.get(month)!;
  const previous = buckets.get(shiftMonth(month, -1));
  const isCurrent = month === currentMonth;
  const [yy, mm] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(yy!, mm!, 0)).getUTCDate();
  const dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : daysInMonth;
  // Housing, subscriptions and fees are mostly fixed; project only the variable part.
  const fixedCategories = new Set(["housing", "subscriptions", "fees"]);
  const fixedSpent = [...selected.byCategory.entries()]
    .filter(([id]) => fixedCategories.has(id))
    .reduce((sum, [, cents]) => sum + cents, 0);
  const variableSpent = selected.spending - fixedSpent;
  const projectedSpendingCents = isCurrent
    ? Math.round(fixedSpent + (variableSpent / Math.max(dayOfMonth, 1)) * daysInMonth)
    : selected.spending;

  const categoryIds = new Set<string>([...selected.byCategory.keys(), ...budgets.keys()]);
  for (const key of averageMonths) for (const id of buckets.get(key)!.byCategory.keys()) categoryIds.add(id);
  const monthTx = tx.filter((row) => monthKeyOf(row) === month);
  const counts = new Map<string, number>();
  for (const row of monthTx) if (spendOf(row) !== 0) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  const categories = [...categoryIds]
    .map((id) => {
      const spent = selected.byCategory.get(id) ?? 0;
      const budget = budgets.get(id) ?? null;
      const avg = avgOf((bucket) => bucket.byCategory.get(id) ?? 0);
      return {
        id,
        spentCents: spent,
        budgetCents: budget,
        leftCents: budget == null ? null : budget - spent,
        usedRatio: budget ? spent / budget : null,
        // Where spending "should" be by today if spread evenly over the month.
        paceRatio: budget ? spent / (budget * (dayOfMonth / daysInMonth)) : null,
        avgCents: avg,
        prevCents: previous?.byCategory.get(id) ?? 0,
        count: counts.get(id) ?? 0,
        share: selected.spending > 0 ? spent / selected.spending : 0,
      };
    })
    .filter((row) => row.spentCents !== 0 || row.budgetCents != null || (row.avgCents ?? 0) > 0)
    .sort((a, b) => b.spentCents - a.spentCents);

  const totalBudgetCents = [...budgets.values()].reduce((sum, cents) => sum + cents, 0);
  const budgetedSpentCents = categories
    .filter((row) => row.budgetCents != null)
    .reduce((sum, row) => sum + Math.max(0, row.spentCents), 0);

  // Cumulative spending per day for the selected month.
  const dailySpend = Array.from({ length: daysInMonth }, () => 0);
  for (const row of monthTx) {
    const spend = spendOf(row);
    if (spend) dailySpend[Number(row.date.slice(8, 10)) - 1] += spend;
  }
  const cumulative: number[] = [];
  let running = 0;
  for (let i = 0; i < dayOfMonth; i += 1) {
    running += dailySpend[i]!;
    cumulative.push(running);
  }
  const prevDaily = Array.from({ length: 31 }, () => 0);
  const prevKey = shiftMonth(month, -1);
  for (const row of tx) {
    if (monthKeyOf(row) !== prevKey) continue;
    const spend = spendOf(row);
    if (spend) prevDaily[Number(row.date.slice(8, 10)) - 1] += spend;
  }
  const prevCumulative: number[] = [];
  running = 0;
  for (let i = 0; i < daysInMonth; i += 1) {
    running += prevDaily[i] ?? 0;
    prevCumulative.push(running);
  }

  // Weekday pattern over the averaging window + selected month.
  const weekday = Array.from({ length: 7 }, () => 0);
  const weekdayMonths = new Set([...averageMonths, month]);
  for (const row of tx) {
    if (!weekdayMonths.has(monthKeyOf(row))) continue;
    const spend = spendOf(row);
    if (spend <= 0) continue;
    const day = (dateFromYmd(row.date).getUTCDay() + 6) % 7; // Monday first
    weekday[day] += spend;
  }

  // Top merchants in the month.
  const merchantMap = new Map<string, { merchant: string; cents: number; count: number; category: string }>();
  for (const row of monthTx) {
    const spend = spendOf(row);
    if (spend <= 0) continue;
    const key = row.merchant || row.counterparty || row.description || "Unknown";
    const entry = merchantMap.get(key) ?? { merchant: key, cents: 0, count: 0, category: row.category };
    entry.cents += spend;
    entry.count += 1;
    merchantMap.set(key, entry);
  }
  const merchants = [...merchantMap.values()].sort((a, b) => b.cents - a.cents).slice(0, 12);

  // Recurring: same merchant, money out, in at least 3 of the last 4 full months.
  const recurringWindow = [1, 2, 3, 4].map((i) => shiftMonth(currentMonth, -i));
  const recurringMap = new Map<string, { months: Set<string>; amounts: number[]; last: FinanceTransactionView; category: string }>();
  const entryCount = (merchant: string) => recurringMap.get(merchant)?.amounts.length ?? 0;
  for (const row of tx) {
    if (row.amountCents >= 0 || row.isTransfer || !row.merchant) continue;
    const key = monthKeyOf(row);
    if (!recurringWindow.includes(key) && key !== currentMonth) continue;
    const entry = recurringMap.get(row.merchant) ?? { months: new Set(), amounts: [], last: row, category: row.category };
    if (recurringWindow.includes(key)) entry.months.add(key);
    entry.amounts.push(-row.amountCents);
    if (row.date >= entry.last.date) entry.last = row;
    recurringMap.set(row.merchant, entry);
  }
  // Bills and subscriptions always count; anything else only when the amount
  // is steady (a weekly ICA run is a habit, not a subscription).
  const billCategories = new Set(["subscriptions", "housing", "fees", "health"]);
  const recurring = [...recurringMap.entries()]
    .filter(([, entry]) => entry.months.size >= 3 && entry.category !== "savings" && entry.category !== "transfer")
    .map(([merchant, entry]) => {
      const sorted = [...entry.amounts].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const perMonth = Math.round(entry.amounts.reduce((sum, value) => sum + value, 0) / Math.max(entry.months.size, 1));
      const steady = sorted.length > 0 && (sorted[sorted.length - 1]! - sorted[0]!) <= Math.max(median * 0.25, 2000);
      return {
        merchant,
        category: entry.category,
        monthlyCents: steady ? median : perMonth,
        steady,
        months: entry.months.size,
        lastDate: entry.last.date,
        lastCents: -entry.last.amountCents,
      };
    })
    .filter((row) => billCategories.has(row.category) || (row.steady && row.months >= 3 && row.monthlyCents > 0 && entryCount(row.merchant) <= 6))
    .sort((a, b) => b.monthlyCents - a.monthlyCents)
    .slice(0, 20);

  const biggest = monthTx
    .filter((row) => spendOf(row) > 0)
    .sort((a, b) => spendOf(b) - spendOf(a))
    .slice(0, 8);

  // Reconstruct the bank total backwards from today's balance, one point per week.
  const balanceHistory: Array<{ date: string; cents: number }> = [];
  {
    const visibleTx = tx.filter((row) => !row.pending);
    const sortedDesc = [...visibleTx].sort((a, b) => (a.date < b.date ? 1 : -1));
    let balance = bankCents - tx.filter((row) => row.pending).reduce((sum, row) => sum + row.amountCents, 0);
    let index = 0;
    const start = `${historyStart}-01`;
    let cursor = today;
    while (cursor >= start) {
      while (index < sortedDesc.length && sortedDesc[index]!.date > cursor) {
        balance -= sortedDesc[index]!.amountCents;
        index += 1;
      }
      balanceHistory.push({ date: cursor, cents: balance });
      cursor = addDaysYmd(cursor, -7);
    }
    balanceHistory.reverse();
    const earliestDate = earliest ? ymd(earliest.bookingDate) : today;
    while (balanceHistory.length > 2 && balanceHistory[0]!.date < earliestDate) balanceHistory.shift();
  }

  const history = months
    .filter((key) => key >= historyStart)
    .map((key) => {
      const bucket = buckets.get(key)!;
      return {
        month: key,
        incomeCents: bucket.income,
        spendingCents: bucket.spending,
        savedCents: bucket.saved,
        netCents: bucket.income - bucket.spending,
        byCategory: Object.fromEntries(bucket.byCategory),
        hasData: key >= firstDataMonth,
      };
    });

  const avgSpending = avgOf((bucket) => bucket.spending);
  const avgIncome = avgOf((bucket) => bucket.income);
  const monthStats = {
    month,
    isCurrent,
    dayOfMonth,
    daysInMonth,
    incomeCents: selected.income,
    spendingCents: selected.spending,
    savedCents: selected.saved,
    netCents: selected.income - selected.spending,
    savingsRate: selected.income > 0 ? (selected.income - selected.spending) / selected.income : null,
    txCount: selected.count,
    prevSpendingCents: previous?.spending ?? null,
    prevIncomeCents: previous?.income ?? null,
    avgSpendingCents: avgSpending,
    avgIncomeCents: avgIncome,
    projectedSpendingCents,
    dailyAverageCents: Math.round(selected.spending / Math.max(dayOfMonth, 1)),
    totalBudgetCents,
    budgetedSpentCents,
    budgetLeftCents: totalBudgetCents ? totalBudgetCents - budgetedSpentCents : null,
    // What can be spent per remaining day and stay inside every budget.
    budgetPerDayLeftCents:
      totalBudgetCents && isCurrent
        ? Math.round(
            Math.max(0, totalBudgetCents - budgetedSpentCents) / Math.max(1, daysInMonth - dayOfMonth + 1),
          )
        : null,
  };

  const insights = buildInsights({ categories, monthStats, merchants, recurring });

  // Habits over the normal months (or this month when there is no history yet).
  const habitMonths = new Set(averageMonths.length ? averageMonths : [month]);
  const categoryCounts: Record<string, { count: number; cents: number; months: number }> = {};
  const smallPurchases = { count: 0, cents: 0, months: habitMonths.size };
  for (const row of tx) {
    if (!habitMonths.has(monthKeyOf(row))) continue;
    const spend = spendOf(row);
    if (spend <= 0) continue;
    const entry = (categoryCounts[row.category] ??= { count: 0, cents: 0, months: habitMonths.size });
    entry.count += 1;
    entry.cents += spend;
    if (spend < 10_000 && row.category !== "subscriptions" && row.category !== "housing") {
      smallPurchases.count += 1;
      smallPurchases.cents += spend;
    }
  }
  const tips = buildSavingsTips({
    bankCents,
    month: monthStats,
    categories,
    recurring,
    weekday,
    smallPurchases,
    categoryCounts,
  });
  const suggestedBudgets = suggestBudgets(categories);
  const coachMeta = await client.financeMeta.findUnique({ where: { key: "coach" } });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    today,
    connection,
    lastSync: (lastSyncMeta?.value as SyncResult | null) ?? null,
    firstDataMonth,
    averageMonths,
    totals: { bankCents, assetsCents, netWorthCents: bankCents + assetsCents },
    accounts,
    assets,
    month: monthStats,
    categories,
    daily: { cumulative, prevCumulative, dailySpend: dailySpend.slice(0, dayOfMonth) },
    weekday,
    history,
    balanceHistory,
    netWorthHistory: snapshots.map((row) => ({
      date: ymd(row.day),
      bankCents: Number(row.bankCents),
      assetsCents: Number(row.assetsCents),
      totalCents: Number(row.bankCents + row.assetsCents),
    })),
    merchants,
    recurring,
    biggest,
    insights,
    tips,
    suggestedBudgets,
    coach: (coachMeta?.value as FinanceCoach | null) ?? null,
  };
}

export type FinanceCoach = { at: string; month: string; model: string; text: string };

function sek(cents: number) {
  return `${Math.round(cents / 100).toLocaleString("sv-SE")} kr`;
}

function buildInsights({
  categories,
  monthStats,
  merchants,
  recurring,
}: {
  categories: Array<{ id: string; spentCents: number; budgetCents: number | null; avgCents: number | null; paceRatio: number | null; usedRatio: number | null }>;
  monthStats: { isCurrent: boolean; projectedSpendingCents: number; avgSpendingCents: number | null; spendingCents: number; savingsRate: number | null; budgetPerDayLeftCents: number | null };
  merchants: Array<{ merchant: string; cents: number; count: number }>;
  recurring: Array<{ monthlyCents: number }>;
}) {
  const insights: Array<{ tone: "good" | "warn" | "bad" | "info"; text: string; category?: string }> = [];
  for (const row of categories) {
    if (row.budgetCents == null) continue;
    if ((row.usedRatio ?? 0) > 1) {
      insights.push({ tone: "bad", category: row.id, text: `Over budget by ${sek(row.spentCents - row.budgetCents)}` });
    } else if (monthStats.isCurrent && (row.paceRatio ?? 0) > 1.15 && (row.usedRatio ?? 0) > 0.3) {
      insights.push({ tone: "warn", category: row.id, text: `Spending faster than the budget allows (${Math.round((row.usedRatio ?? 0) * 100)}% used)` });
    }
  }
  for (const row of categories) {
    if (row.avgCents && row.avgCents > 20_000 && row.spentCents > row.avgCents * 1.3 && row.budgetCents == null) {
      insights.push({ tone: "warn", category: row.id, text: `${Math.round((row.spentCents / row.avgCents - 1) * 100)}% above your usual ${sek(row.avgCents)}/month` });
    }
  }
  if (monthStats.isCurrent && monthStats.avgSpendingCents) {
    const diff = monthStats.projectedSpendingCents - monthStats.avgSpendingCents;
    if (Math.abs(diff) > monthStats.avgSpendingCents * 0.1) {
      insights.push({
        tone: diff > 0 ? "warn" : "good",
        text: `On pace for ${sek(monthStats.projectedSpendingCents)} this month, ${sek(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than usual`,
      });
    }
  }
  if (monthStats.budgetPerDayLeftCents != null) {
    insights.push({ tone: "info", text: `${sek(monthStats.budgetPerDayLeftCents)} per day left across your budgets` });
  }
  if (monthStats.savingsRate != null && monthStats.savingsRate > 0.2) {
    insights.push({ tone: "good", text: `Keeping ${Math.round(monthStats.savingsRate * 100)}% of what came in` });
  }
  const top = merchants[0];
  if (top && top.count >= 4) {
    insights.push({ tone: "info", text: `${top.merchant}: ${top.count} purchases, ${sek(top.cents)} this month` });
  }
  const recurringTotal = recurring.reduce((sum, row) => sum + row.monthlyCents, 0);
  if (recurringTotal > 0) {
    insights.push({ tone: "info", text: `Repeating payments add up to about ${sek(recurringTotal)}/month` });
  }
  return insights.slice(0, 8);
}

export type FinanceSummary = Awaited<ReturnType<typeof getFinanceSummary>>;

export function psuFromRequest(request: Request): PsuContext {
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    undefined;
  return { ip, userAgent: request.headers.get("user-agent") ?? undefined };
}
