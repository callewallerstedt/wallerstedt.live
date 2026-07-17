import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { getAccountingDb } from "../lib/accounting/db";
import { updateAccount, updateEntry } from "../lib/accounting/service";

try {
  process.loadEnvFile(resolve(process.cwd(), ".env.local"));
} catch {
  // Explicit process environment remains supported.
}

const databasePath = resolve(
  process.env.ACCOUNTING_SQLITE_PATH || resolve(process.cwd(), "..", "data", "bokforing.db"),
);

const python = String.raw`
import json, sqlite3, sys
db = sqlite3.connect("file:" + sys.argv[1].replace("\\", "/") + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
accounts = [dict(row) for row in db.execute("SELECT account,name,category FROM accounts ORDER BY account")]
transactions = [dict(row) for row in db.execute("SELECT id,description,debit_name,credit_name,type,source,notes,status FROM transactions ORDER BY id")]
db.close()
print(json.dumps({"accounts": accounts, "transactions": transactions}, ensure_ascii=True))
`;

type LocalAccount = { account: number; name: string | null; category: string | null };
type LocalTransaction = {
  id: number;
  description: string | null;
  debit_name: string | null;
  credit_name: string | null;
  type: string | null;
  source: string | null;
  notes: string | null;
  status: string | null;
};

function readLocal(): { accounts: LocalAccount[]; transactions: LocalTransaction[] } {
  const result = spawnSync("python", ["-c", python, databasePath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not read the local SQLite source.");
  return JSON.parse(result.stdout) as { accounts: LocalAccount[]; transactions: LocalTransaction[] };
}

function isCorrupted(value: unknown): value is string {
  return typeof value === "string" && value.includes("\uFFFD");
}

async function main() {
  const local = readLocal();
  const db = getAccountingDb();
  const localAccounts = new Map(local.accounts.map((account) => [account.account, account]));
  const localTransactions = new Map(local.transactions.map((entry) => [entry.id, entry]));
  const cloudAccounts = await db.accountingAccount.findMany({ where: { deletedAt: null } });
  const cloudEntries = await db.accountingEntry.findMany({ where: { deletedAt: null } });
  let repairedAccounts = 0;
  let repairedEntries = 0;
  let repairedFields = 0;

  for (const account of cloudAccounts) {
    const source = localAccounts.get(account.legacyId ?? account.account);
    if (!source) continue;
    const patch: { name?: string; category?: string | null } = {};
    if (isCorrupted(account.name) && typeof source.name === "string") patch.name = source.name;
    if (isCorrupted(account.category) && (typeof source.category === "string" || source.category === null)) {
      patch.category = source.category;
    }
    const count = Object.keys(patch).length;
    if (!count) continue;
    await updateAccount(account.id, account.version, patch, "encoding-repair-local-source");
    repairedAccounts += 1;
    repairedFields += count;
  }

  const mappings = [
    ["description", "description"],
    ["debitName", "debit_name"],
    ["creditName", "credit_name"],
    ["type", "type"],
    ["source", "source"],
    ["notes", "notes"],
    ["status", "status"],
  ] as const;
  for (const entry of cloudEntries) {
    if (entry.legacyId === null) continue;
    const source = localTransactions.get(entry.legacyId);
    if (!source) continue;
    const patch: Record<string, string | null> = {};
    for (const [cloudField, localField] of mappings) {
      const current = entry[cloudField];
      const corrected = source[localField];
      if (isCorrupted(current) && (typeof corrected === "string" || corrected === null)) {
        patch[cloudField] = corrected;
      }
    }
    const count = Object.keys(patch).length;
    if (!count) continue;
    await updateEntry(entry.id, entry.version, patch, "encoding-repair-local-source");
    repairedEntries += 1;
    repairedFields += count;
  }

  const remainingEntries = await db.accountingEntry.findMany({ where: { deletedAt: null } });
  const remainingAccounts = await db.accountingAccount.findMany({ where: { deletedAt: null } });
  const remainingCorruption = [...remainingEntries, ...remainingAccounts].reduce(
    (count, row) => count + Object.values(row).filter(isCorrupted).length,
    0,
  );
  console.log(JSON.stringify({ repairedAccounts, repairedEntries, repairedFields, remainingCorruption }));
  await db.$disconnect();
  if (remainingCorruption !== 0) throw new Error("Some corrupted accounting text remains.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
