import { Prisma, type AccountingEntry } from "@prisma/client";
import { calculateAccountBalances, centsToMoney } from "./balances";
import { getAccountingDb } from "./db";
import { AccountingConflictError, AccountingError } from "./errors";
import {
  serializeAccount,
  serializeDocument,
  serializeEntry,
  serializeRevision,
} from "./serialize";
import type { NormalizedEntryInput } from "./validation";

type TransactionClient = Prisma.TransactionClient;

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function dateOnly(value: string | null | undefined) {
  return value
    ? new Date(`${value}T00:00:00.000Z`)
    : value === null
      ? null
      : undefined;
}

function setIfPresent<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
) {
  if (value !== undefined) target[key] = value;
}

function entryUpdateData(input: NormalizedEntryInput) {
  const data: Prisma.AccountingEntryUncheckedUpdateInput = {};
  if (input.legacyId !== null) setIfPresent(data, "legacyId", input.legacyId);
  setIfPresent(data, "date", dateOnly(input.date));
  setIfPresent(
    data,
    "description",
    input.description ?? (input.description === null ? "" : undefined),
  );
  setIfPresent(data, "debitName", input.debitName);
  setIfPresent(data, "debitAccount", input.debitAccount);
  setIfPresent(data, "creditName", input.creditName);
  setIfPresent(data, "creditAccount", input.creditAccount);
  setIfPresent(data, "amountExVat", input.amountExVat);
  setIfPresent(data, "vatAmount", input.vatAmount);
  setIfPresent(data, "vatAccount", input.vatAccount);
  setIfPresent(data, "amount", input.amount);
  setIfPresent(
    data,
    "type",
    input.type ?? (input.type === null ? "" : undefined),
  );
  setIfPresent(data, "source", input.source);
  setIfPresent(
    data,
    "notes",
    input.notes ?? (input.notes === null ? "" : undefined),
  );
  setIfPresent(data, "status", input.status);
  setIfPresent(data, "updatedAt", input.updatedAt);
  return data;
}

function entryCreateData(
  input: NormalizedEntryInput,
  options: { id?: string; legacyId?: number | null } = {},
): Prisma.AccountingEntryUncheckedCreateInput {
  if (input.amount === null || input.amount === undefined) {
    throw new AccountingError("Amount is required.", 400, "amount_required");
  }
  return {
    ...(options.id ? { id: options.id } : {}),
    legacyId: options.legacyId ?? input.legacyId ?? null,
    date: dateOnly(input.date) ?? null,
    description: input.description ?? "",
    debitName: input.debitName ?? null,
    debitAccount: input.debitAccount ?? null,
    creditName: input.creditName ?? null,
    creditAccount: input.creditAccount ?? null,
    amountExVat: input.amountExVat ?? null,
    vatAmount: input.vatAmount ?? null,
    vatAccount: input.vatAccount ?? null,
    amount: input.amount,
    type: input.type ?? "Utbetalning",
    source: input.source ?? null,
    notes: input.notes ?? "",
    status: input.status === undefined ? "Bokförd" : input.status,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

async function recordEntryVersion(
  tx: TransactionClient,
  entry: AccountingEntry,
  action: string,
  actor: string,
) {
  const snapshot = serializeEntry(entry);
  await tx.accountingEntryRevision.create({
    data: {
      entryId: entry.id,
      version: entry.version,
      action,
      actor,
      snapshot: json(snapshot),
    },
  });
  await tx.accountingAuditEvent.create({
    data: {
      entityType: "transaction",
      entityId: entry.id,
      operation: action === "delete" ? "delete" : "upsert",
      version: entry.version,
      actor,
      payload: json(snapshot),
    },
  });
}

export async function createEntryInTransaction(
  tx: TransactionClient,
  input: NormalizedEntryInput,
  actor: string,
  options: { id?: string; legacyId?: number | null; action?: string } = {},
) {
  const entry = await tx.accountingEntry.create({
    data: entryCreateData(input, options),
  });
  await recordEntryVersion(tx, entry, options.action ?? "create", actor);
  return entry;
}

export async function createEntry(input: NormalizedEntryInput, actor = "web") {
  const db = getAccountingDb();
  return db.$transaction((tx) => createEntryInTransaction(tx, input, actor));
}

export async function updateEntryInTransaction(
  tx: TransactionClient,
  id: string,
  expectedVersion: number,
  input: NormalizedEntryInput,
  actor: string,
) {
  const current = await tx.accountingEntry.findUnique({ where: { id } });
  if (!current)
    throw new AccountingError("Entry not found.", 404, "entry_not_found");
  if (current.version !== expectedVersion || current.deletedAt) {
    throw new AccountingConflictError("The entry changed on another device.", {
      server: serializeEntry(current),
      serverVersion: current.version,
    });
  }
  if (
    input.legacyId &&
    current.legacyId &&
    input.legacyId !== current.legacyId
  ) {
    throw new AccountingConflictError("The entry has a different local ID.", {
      server: serializeEntry(current),
      serverVersion: current.version,
    });
  }

  const result = await tx.accountingEntry.updateMany({
    where: { id, version: expectedVersion, deletedAt: null },
    data: {
      ...entryUpdateData(input),
      version: { increment: 1 },
    },
  });
  if (result.count !== 1) {
    const server = await tx.accountingEntry.findUnique({ where: { id } });
    throw new AccountingConflictError("The entry changed on another device.", {
      server: server ? serializeEntry(server) : null,
      serverVersion: server?.version ?? null,
    });
  }
  const entry = await tx.accountingEntry.findUniqueOrThrow({ where: { id } });
  await recordEntryVersion(tx, entry, "update", actor);
  return entry;
}

export async function updateEntry(
  id: string,
  expectedVersion: number,
  input: NormalizedEntryInput,
  actor = "web",
) {
  const db = getAccountingDb();
  return db.$transaction((tx) =>
    updateEntryInTransaction(tx, id, expectedVersion, input, actor),
  );
}

export async function deleteEntryInTransaction(
  tx: TransactionClient,
  id: string,
  expectedVersion: number,
  actor: string,
) {
  const current = await tx.accountingEntry.findUnique({ where: { id } });
  if (!current)
    throw new AccountingError("Entry not found.", 404, "entry_not_found");
  if (current.version !== expectedVersion || current.deletedAt) {
    throw new AccountingConflictError("The entry changed on another device.", {
      server: serializeEntry(current),
      serverVersion: current.version,
    });
  }
  const deletedAt = new Date();
  const updated = await tx.accountingEntry.updateMany({
    where: { id, version: expectedVersion, deletedAt: null },
    data: { deletedAt, version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    const server = await tx.accountingEntry.findUnique({ where: { id } });
    throw new AccountingConflictError("The entry changed on another device.", {
      server: server ? serializeEntry(server) : null,
      serverVersion: server?.version ?? null,
    });
  }
  const entry = await tx.accountingEntry.findUniqueOrThrow({ where: { id } });
  await recordEntryVersion(tx, entry, "delete", actor);
  return entry;
}

export async function deleteEntry(
  id: string,
  expectedVersion: number,
  actor = "web",
) {
  const db = getAccountingDb();
  return db.$transaction((tx) =>
    deleteEntryInTransaction(tx, id, expectedVersion, actor),
  );
}

export async function getEntry(id: string) {
  const entry = await getAccountingDb().accountingEntry.findUnique({
    where: { id },
    include: {
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!entry || entry.deletedAt) {
    throw new AccountingError("Entry not found.", 404, "entry_not_found");
  }
  return serializeEntry(entry);
}

export async function listEntryRevisions(id: string) {
  const rows = await getAccountingDb().accountingEntryRevision.findMany({
    where: { entryId: id },
    orderBy: { version: "desc" },
  });
  return rows.map(serializeRevision);
}

export async function listEntries(searchParams: URLSearchParams) {
  const db = getAccountingDb();
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 100) || 100, 1),
    250,
  );
  const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1);
  const q = searchParams.get("q")?.trim().slice(0, 200);
  const type = searchParams.get("type")?.trim().slice(0, 100);
  const status = searchParams.get("status")?.trim().slice(0, 100);
  const where: Prisma.AccountingEntryWhereInput = {
    deletedAt: null,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: "insensitive" } },
            { source: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
            { debitName: { contains: q, mode: "insensitive" } },
            { creditName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.accountingEntry.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { documents: { where: { deletedAt: null } } } },
      },
    }),
    db.accountingEntry.count({ where }),
  ]);
  return { entries: rows.map(serializeEntry), total, page, limit };
}

async function auditAccount(
  tx: TransactionClient,
  account: Awaited<
    ReturnType<TransactionClient["accountingAccount"]["findUniqueOrThrow"]>
  >,
  operation: "upsert" | "delete",
  actor: string,
) {
  await tx.accountingAuditEvent.create({
    data: {
      entityType: "account",
      entityId: account.id,
      operation,
      version: account.version,
      actor,
      payload: json(serializeAccount(account)),
    },
  });
}

export async function createAccount(
  input: {
    account: number;
    name: string;
    category?: string | null;
    legacyId?: number | null;
  },
  actor = "web",
) {
  const db = getAccountingDb();
  return db.$transaction(async (tx) => {
    const existing = await tx.accountingAccount.findFirst({
      where: {
        OR: [
          { account: input.account },
          ...(input.legacyId ? [{ legacyId: input.legacyId }] : []),
        ],
      },
    });
    if (existing) {
      throw new AccountingConflictError("That account already exists.", {
        server: serializeAccount(existing),
        serverVersion: existing.version,
      });
    }
    const account = await tx.accountingAccount.create({
      data: {
        account: input.account,
        name: input.name,
        category: input.category ?? null,
        legacyId: input.legacyId ?? null,
      },
    });
    await auditAccount(tx, account, "upsert", actor);
    return account;
  });
}

export async function updateAccount(
  id: string,
  expectedVersion: number,
  input: {
    account?: number;
    name?: string;
    category?: string | null;
    legacyId?: number | null;
  },
  actor = "web",
) {
  const db = getAccountingDb();
  return db.$transaction(async (tx) => {
    const current = await tx.accountingAccount.findUnique({ where: { id } });
    if (!current)
      throw new AccountingError("Account not found.", 404, "account_not_found");
    if (current.version !== expectedVersion || current.deletedAt) {
      throw new AccountingConflictError(
        "The account changed on another device.",
        {
          server: serializeAccount(current),
          serverVersion: current.version,
        },
      );
    }
    if (
      input.legacyId &&
      current.legacyId &&
      input.legacyId !== current.legacyId
    ) {
      throw new AccountingConflictError(
        "The account has a different local ID.",
        {
          server: serializeAccount(current),
          serverVersion: current.version,
        },
      );
    }
    const { legacyId, ...fields } = input;
    const result = await tx.accountingAccount.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        ...fields,
        ...(legacyId ? { legacyId } : {}),
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new AccountingConflictError(
        "The account changed on another device.",
      );
    }
    const account = await tx.accountingAccount.findUniqueOrThrow({
      where: { id },
    });
    await auditAccount(tx, account, "upsert", actor);
    return account;
  });
}

export async function deleteAccount(
  id: string,
  expectedVersion: number,
  actor = "web",
) {
  const db = getAccountingDb();
  return db.$transaction(async (tx) => {
    const current = await tx.accountingAccount.findUnique({ where: { id } });
    if (!current)
      throw new AccountingError("Account not found.", 404, "account_not_found");
    if (current.version !== expectedVersion || current.deletedAt) {
      throw new AccountingConflictError(
        "The account changed on another device.",
        {
          server: serializeAccount(current),
          serverVersion: current.version,
        },
      );
    }
    const result = await tx.accountingAccount.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new AccountingConflictError("The account changed.");
    const account = await tx.accountingAccount.findUniqueOrThrow({
      where: { id },
    });
    await auditAccount(tx, account, "delete", actor);
    return account;
  });
}

export async function listAccounts() {
  const rows = await getAccountingDb().accountingAccount.findMany({
    where: { deletedAt: null },
    orderBy: { account: "asc" },
  });
  return rows.map(serializeAccount);
}

export async function dashboard() {
  const db = getAccountingDb();
  const [entries, documentCount, pendingDraftCount, latestBackup] =
    await Promise.all([
      db.accountingEntry.findMany({
        where: { deletedAt: null },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: {
          _count: { select: { documents: { where: { deletedAt: null } } } },
        },
      }),
      db.accountingDocument.count({ where: { deletedAt: null } }),
      db.accountingAiDraft.count({ where: { status: "pending" } }),
      db.accountingBackup.findFirst({ orderBy: { createdAt: "desc" } }),
    ]);
  let income = new Prisma.Decimal(0);
  let expenses = new Prisma.Decimal(0);
  let vat = new Prisma.Decimal(0);
  let debt = new Prisma.Decimal(0);
  let missingReceiptCount = 0;
  const months = new Map<
    string,
    { income: Prisma.Decimal; expenses: Prisma.Decimal }
  >();
  for (const entry of entries) {
    const key = entry.date?.toISOString().slice(0, 7) ?? "Unknown";
    const month = months.get(key) ?? {
      income: new Prisma.Decimal(0),
      expenses: new Prisma.Decimal(0),
    };
    const typeKey = entry.type.toLocaleLowerCase("sv");
    if (typeKey.includes("inbetal") || typeKey === "income") {
      income = income.plus(entry.amount);
      month.income = month.income.plus(entry.amount);
    } else if (typeKey.includes("utbetal") || typeKey === "expense") {
      expenses = expenses.plus(entry.amount.abs());
      month.expenses = month.expenses.plus(entry.amount.abs());
      if (entry._count.documents === 0) missingReceiptCount += 1;
    } else if (typeKey.includes("skuld") || typeKey.includes("debt")) {
      debt = debt.plus(entry.amount.abs());
    }
    if (entry.vatAmount) vat = vat.plus(entry.vatAmount);
    months.set(key, month);
  }
  const totals = {
    income: income.toFixed(2),
    expenses: expenses.toFixed(2),
    result: income.minus(expenses).toFixed(2),
    vat: vat.toFixed(2),
    // This simplified ledger has no bank reconciliation model yet; expose result explicitly.
    balance: income.minus(expenses).toFixed(2),
  };
  const accountBalances = calculateAccountBalances(entries);
  const recent = entries.slice(0, 8).map(serializeEntry);
  return {
    totals,
    summary: {
      ...totals,
      companyAccountBalance: centsToMoney(accountBalances.companyAccountCents),
      capitalInsuranceBalance: centsToMoney(accountBalances.capitalInsuranceCents),
      accountBalancesAsOf: accountBalances.asOf,
      debt: debt.toFixed(2),
      missingReceiptCount,
      entryCount: entries.length,
      receiptCount: documentCount,
    },
    entryCount: entries.length,
    documentCount,
    pendingDraftCount,
    latestBackup: latestBackup
      ? {
          id: latestBackup.id,
          status: latestBackup.status,
          sha256: latestBackup.sha256,
          byteSize: latestBackup.byteSize,
          entryCount: latestBackup.entryCount,
          documentCount: latestBackup.documentCount,
          createdBy: latestBackup.createdBy,
          createdAt: latestBackup.createdAt.toISOString(),
        }
      : null,
    backup: latestBackup
      ? {
          lastAt: latestBackup.createdAt.toISOString(),
          status: latestBackup.status,
        }
      : { lastAt: null, status: "missing" },
    byMonth: [...months.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 18)
      .map(([month, values]) => ({
        month,
        income: values.income.toFixed(2),
        expenses: values.expenses.toFixed(2),
        result: values.income.minus(values.expenses).toFixed(2),
      })),
    recent,
    recentEntries: recent,
  };
}

export async function softDeleteDocument(
  id: string,
  expectedVersion: number,
  actor = "web",
) {
  const db = getAccountingDb();
  return db.$transaction(async (tx) => {
    const current = await tx.accountingDocument.findUnique({ where: { id } });
    if (!current)
      throw new AccountingError(
        "Document not found.",
        404,
        "document_not_found",
      );
    if (current.version !== expectedVersion || current.deletedAt) {
      throw new AccountingConflictError(
        "The document changed on another device.",
        {
          server: serializeDocument(current),
          serverVersion: current.version,
        },
      );
    }
    const result = await tx.accountingDocument.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new AccountingConflictError("The document changed.");
    const document = await tx.accountingDocument.findUniqueOrThrow({
      where: { id },
    });
    await tx.accountingAuditEvent.create({
      data: {
        entityType: "receipt",
        entityId: document.id,
        operation: "delete",
        version: document.version,
        actor,
        payload: json(serializeDocument(document)),
      },
    });
    return document;
  });
}
