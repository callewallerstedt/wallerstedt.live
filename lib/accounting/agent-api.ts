import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { calculateSelectedAccountBalances, centsToMoney } from "./balances";
import { getAccountingDb } from "./db";
import { AccountingConflictError } from "./errors";
import { invalidateOsLedgerCache } from "../os/cache";
import { serializeEntry } from "./serialize";
import { classifyEntryPatch, safeNotifyAccountingPosts } from "../push";
import {
  createEntryInTransaction,
  getEntry,
  updateEntry,
  updateEntryInTransaction,
} from "./service";
import type { NormalizedEntryInput } from "./validation";

export const DEFAULT_AGENT_BALANCE_ACCOUNTS = [1930, 2893, 1385] as const;

function canonicalBankText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
}

function canonicalMoney(value: string | number) {
  return new Prisma.Decimal(value).toFixed(2);
}

export type BankRow = {
  bankText: string;
  date: string;
  amount: string | number;
  bankAccountId?: string;
  bankTransactionId?: string;
};

export function bankRowIdempotencyKey(input: BankRow) {
  if (input.bankAccountId && input.bankTransactionId) {
    return `bank:v2:${createHash("sha256").update(JSON.stringify([input.bankAccountId, input.bankTransactionId]), "utf8").digest("hex")}`;
  }
  const fingerprint = [
    "bank-row-v1",
    canonicalBankText(input.bankText),
    input.date,
    canonicalMoney(input.amount),
  ].join("\n");
  return `bank:v1:${createHash("sha256").update(fingerprint, "utf8").digest("hex")}`;
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

async function entryForOperation(operationId: string) {
  const operation = await getAccountingDb().accountingSyncOperation.findUnique({
    where: { id: operationId },
  });
  if (!operation?.entityId) return null;
  const entry = await getAccountingDb().accountingEntry.findUnique({
    where: { id: operation.entityId },
  });
  if (entry?.deletedAt) throw new AccountingConflictError("That bank row belongs to a deleted entry. Review its history before rebooking.", { entryId: entry.id, deletedAt: entry.deletedAt.toISOString() });
  return entry;
}

export async function createIdempotentAgentEntry(
  input: NormalizedEntryInput,
  bankRow: BankRow,
) {
  const db = getAccountingDb();
  const idempotencyKey = bankRowIdempotencyKey(bankRow);
  const existingByKey = await entryForOperation(idempotencyKey);
  if (existingByKey) {
    if (existingByKey.date?.toISOString().slice(0, 10) !== bankRow.date || canonicalMoney(existingByKey.amount.toString()) !== canonicalMoney(bankRow.amount)) {
      throw new AccountingConflictError("This bank identity already exists with a different dated amount. Read the existing entry before retrying.", { server: serializeEntry(existingByKey), serverVersion: existingByKey.version });
    }
    return { entry: serializeEntry(existingByKey), created: false, deduplicatedBy: "idempotency-key" as const };
  }

  // Entries created before this API have no fingerprint. Match those once so
  // adopting the endpoint cannot duplicate an already-booked bank row.
  const legacyMatches = bankRow.bankTransactionId ? [] : await db.accountingEntry.findMany({
    where: {
      deletedAt: null,
      date: new Date(`${bankRow.date}T00:00:00.000Z`),
      amount: canonicalMoney(bankRow.amount),
      OR: [
        { source: { equals: bankRow.bankText.trim(), mode: "insensitive" } },
        { description: { equals: bankRow.bankText.trim(), mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  if (legacyMatches.length > 1) throw new AccountingConflictError("Several ledger rows match. Inspect them and use a stable bank transaction identity.");
  const existingLedgerRow = legacyMatches[0];
  if (existingLedgerRow) {
    await db.accountingSyncOperation.create({
      data: {
        id: idempotencyKey,
        entityType: "transaction",
        entityId: existingLedgerRow.id,
        operation: "agent-ledger-match",
        baseVersion: existingLedgerRow.version,
        appliedVersion: existingLedgerRow.version,
        status: "applied",
        request: json(bankRow),
        response: json({ entryId: existingLedgerRow.id, version: existingLedgerRow.version }),
      },
    }).catch(async (error) => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    });
    const bound = await entryForOperation(idempotencyKey);
    if (!bound) throw new AccountingConflictError("The bank identity changed during matching. Read the ledger again.");
    return { entry: serializeEntry(bound), created: false, deduplicatedBy: "ledger-match" as const };
  }

  try {
    const entry = await db.$transaction(async (tx) => {
      const created = await createEntryInTransaction(tx, input, "agent-api");
      await tx.accountingSyncOperation.create({
        data: {
          id: idempotencyKey,
          entityType: "transaction",
          entityId: created.id,
          operation: "agent-create",
          baseVersion: null,
          appliedVersion: created.version,
          status: "applied",
          request: json(bankRow),
          response: json({ entryId: created.id, version: created.version }),
        },
      });
      return created;
    });
    invalidateOsLedgerCache();
    await safeNotifyAccountingPosts("create", [entry]);
    return { entry: serializeEntry(entry), created: true, deduplicatedBy: null };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await entryForOperation(idempotencyKey);
      if (raced) {
        if (raced.date?.toISOString().slice(0, 10) !== bankRow.date || canonicalMoney(raced.amount.toString()) !== canonicalMoney(bankRow.amount)) {
          throw new AccountingConflictError("Concurrent requests reused one bank identity for different dated amounts.", { server: serializeEntry(raced), serverVersion: raced.version });
        }
        return { entry: serializeEntry(raced), created: false, deduplicatedBy: "idempotency-key" as const };
      }
    }
    throw error;
  }
}

export async function updateAgentEntry(
  id: string,
  expectedVersion: number,
  input: NormalizedEntryInput,
  bankRow?: BankRow,
) {
  const idempotencyKey = bankRow ? bankRowIdempotencyKey(bankRow) : undefined;
  if (!idempotencyKey || !bankRow) {
    return serializeEntry(await updateEntry(id, expectedVersion, input, "agent-api"));
  }

  const db = getAccountingDb();
  try {
    const entry = await db.$transaction(async (tx) => {
      const existing = await tx.accountingSyncOperation.findUnique({
        where: { id: idempotencyKey },
      });
      if (existing?.entityId && existing.entityId !== id) {
        const duplicate = await tx.accountingEntry.findUnique({ where: { id: existing.entityId } });
        throw new AccountingConflictError("That bank row is already booked.", {
          server: duplicate ? serializeEntry(duplicate) : null,
          serverVersion: duplicate?.version ?? null,
        });
      }
      const updated = await updateEntryInTransaction(
        tx,
        id,
        expectedVersion,
        input,
        "agent-api",
      );
      if (!existing) {
        await tx.accountingSyncOperation.create({
          data: {
            id: idempotencyKey,
            entityType: "transaction",
            entityId: id,
            operation: "agent-update",
            baseVersion: expectedVersion,
            appliedVersion: updated.version,
            status: "applied",
            request: json(bankRow),
            response: json({ entryId: id, version: updated.version }),
          },
        });
      }
      return updated;
    });
    invalidateOsLedgerCache();
    await safeNotifyAccountingPosts(classifyEntryPatch(input), [entry]);
    return serializeEntry(entry);
  } catch (error) {
    if (
      idempotencyKey
      && error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      const existing = await entryForOperation(idempotencyKey);
      if (existing?.id === id) {
        return serializeEntry(await updateEntry(id, expectedVersion, input, "agent-api"));
      }
      throw new AccountingConflictError("That bank row is already booked.", {
        server: existing ? serializeEntry(existing) : null,
        serverVersion: existing?.version ?? null,
      });
    }
    throw error;
  }
}

export async function accountBalances(accountNumbers: number[]) {
  const db = getAccountingDb();
  const [entries, accounts] = await Promise.all([
    db.accountingEntry.findMany({
      where: {
        deletedAt: null,
        OR: [
          { debitAccount: { in: accountNumbers } },
          { creditAccount: { in: accountNumbers } },
          { vatAccount: { in: accountNumbers } },
        ],
      },
      select: {
        amount: true,
        amountExVat: true,
        vatAmount: true,
        vatAccount: true,
        debitAccount: true,
        creditAccount: true,
        date: true,
      },
    }),
    db.accountingAccount.findMany({
      where: { deletedAt: null, account: { in: accountNumbers } },
      select: { account: true, name: true },
    }),
  ]);
  const names = new Map(accounts.map((account) => [account.account, account.name]));
  const calculated = calculateSelectedAccountBalances(entries, accountNumbers);
  return {
    asOf: calculated.asOf,
    accounts: calculated.balances.map((balance) => ({
      account: balance.account,
      name: names.get(balance.account) ?? null,
      balance: balance.balanceCents / 100,
      debit: balance.debitCents / 100,
      credit: balance.creditCents / 100,
      exact: centsToMoney(balance.balanceCents),
      entryCount: balance.entryCount,
    })),
  };
}

export async function currentAgentEntry(id: string) {
  return getEntry(id);
}
