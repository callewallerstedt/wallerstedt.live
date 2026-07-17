import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { upload } from "@vercel/blob/client";

try {
  process.loadEnvFile?.(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"),
  );
} catch {
  // Explicit process environment still works when no local env file exists.
}

const UUID_NAMESPACE = "a65177a0-7f62-5bfd-862f-6aa0d989488a";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const databasePath = resolve(
  process.env.ACCOUNTING_SQLITE_PATH ||
    resolve(repoRoot, "..", "data", "bokforing.db"),
);
const baseUrl = (
  process.env.ACCOUNTING_BASE_URL || "https://www.wallerstedt.live"
).replace(/\/$/, "");
const syncToken = process.env.ACCOUNTING_SYNC_TOKEN?.trim() || "";

if (!existsSync(databasePath))
  throw new Error(`SQLite database not found: ${databasePath}`);
if (syncToken.length < 32)
  throw new Error("ACCOUNTING_SYNC_TOKEN is missing or too short.");

const python = String.raw`
import json, sqlite3, sys
from decimal import Decimal, ROUND_HALF_UP

def money(value):
    if value is None:
        return None
    return format(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f")

path = sys.argv[1]
db = sqlite3.connect("file:" + path.replace("\\", "/") + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
accounts = [dict(row) for row in db.execute("SELECT account,name,category FROM accounts ORDER BY account")]
transactions = []
for row in db.execute("SELECT * FROM transactions ORDER BY id"):
    item = dict(row)
    for key in ("belopp_ex_moms", "moms", "amount"):
        item[key] = money(item.get(key))
    transactions.append(item)
receipts = [dict(row) for row in db.execute("SELECT id,transaction_id,filename,path,added_at FROM receipts ORDER BY id")]
db.close()
print(json.dumps({"accounts": accounts, "transactions": transactions, "receipts": receipts}, ensure_ascii=False))
`;

function readDesktopData() {
  const candidates = [process.env.PYTHON, "python", "py"].filter(Boolean);
  for (const executable of candidates) {
    const args =
      executable === "py"
        ? ["-3", "-c", python, databasePath]
        : ["-c", python, databasePath];
    const result = spawnSync(executable, args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return JSON.parse(result.stdout);
  }
  throw new Error("Python 3 is required to read the local SQLite database.");
}

function uuidBytes(uuid) {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function formatUuid(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function uuidV5(name) {
  const bytes = createHash("sha1")
    .update(uuidBytes(UUID_NAMESPACE))
    .update(Buffer.from(name, "utf8"))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function operationId(entityType, localId, revision = "bootstrap-v1") {
  return `accounting-import:${revision}:${entityType}:${localId}`;
}

async function sync(operations, cursor = null) {
  const response = await fetch(`${baseUrl}/api/accounting/sync`, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${syncToken}`,
      "Content-Type": "application/json",
      "X-Accounting-Device-Id": "manual-import-script",
      "X-Accounting-Device-Name": "One-time SQLite importer",
      "X-Accounting-App-Version": "1",
    },
    body: JSON.stringify({ cursor, operations }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(
      `Accounting sync failed with HTTP ${response.status} (${body?.error || "unknown"}).`,
    );
  }
  if (body.conflicts?.length) {
    const summary = body.conflicts
      .map((item) => `${item.opId}:${item.reason}`)
      .join(", ");
    throw new Error(
      `Import stopped on ${body.conflicts.length} conflict(s): ${summary}`,
    );
  }
  return body;
}

async function pullCloudState() {
  const maps = {
    account: new Map(),
    transaction: new Map(),
    receipt: new Map(),
  };
  let cursor = null;
  for (;;) {
    const page = await sync([], cursor);
    for (const change of page.changes || []) {
      maps[change.entityType]?.set(change.remoteId, {
        version: change.version,
        operation: change.operation,
        data: change.data,
      });
    }
    if (page.cursor === cursor) break;
    cursor = page.cursor;
  }
  return maps;
}

function transactionOperation(transaction) {
  return {
    opId: operationId("transaction", transaction.id),
    entityType: "transaction",
    operation: "upsert",
    remoteId: uuidV5(`transaction:${transaction.id}`),
    version: 1,
    baseVersion: 0,
    data: {
      legacyId: transaction.id,
      date: transaction.date,
      description: transaction.description || "",
      debitName: transaction.debit_name,
      debitAccount: transaction.debit_account,
      creditName: transaction.credit_name,
      creditAccount: transaction.credit_account,
      beloppExMoms: transaction.belopp_ex_moms,
      moms: transaction.moms,
      momsAccount: transaction.moms_account,
      amount: transaction.amount,
      type: transaction.type,
      source: transaction.source,
      notes: transaction.notes || "",
      status: transaction.status,
      createdAt: transaction.created_at,
      updatedAt: transaction.updated_at,
    },
  };
}

function accountOperation(account) {
  return {
    opId: operationId("account", account.account),
    entityType: "account",
    operation: "upsert",
    remoteId: uuidV5(`account:${account.account}`),
    version: 1,
    baseVersion: 0,
    data: {
      legacyId: account.account,
      account: account.account,
      name: account.name,
      category: account.category,
    },
  };
}

function nullableMoney(value) {
  return value === null || value === undefined
    ? null
    : amountString(cents(value));
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function nullableTimestamp(value) {
  if (!value) return null;
  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    raw,
  )
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function canonicalAccount(data) {
  return {
    legacyId: nullableInteger(data.legacyId),
    account: nullableInteger(data.account),
    name: data.name ?? "",
    category: data.category ?? null,
  };
}

function canonicalTransaction(data) {
  return {
    legacyId: nullableInteger(data.legacyId),
    date: data.date ? String(data.date).slice(0, 10) : null,
    description: data.description ?? "",
    debitName: data.debitName ?? null,
    debitAccount: nullableInteger(data.debitAccount),
    creditName: data.creditName ?? null,
    creditAccount: nullableInteger(data.creditAccount),
    beloppExMoms: nullableMoney(data.beloppExMoms ?? data.amountExVat),
    moms: nullableMoney(data.moms ?? data.vatAmount),
    momsAccount: nullableInteger(data.momsAccount ?? data.vatAccount),
    amount: nullableMoney(data.amount),
    type: data.type ?? null,
    source: data.source ?? null,
    notes: data.notes ?? "",
    status: data.status ?? null,
    createdAt: nullableTimestamp(data.createdAt),
    updatedAt: nullableTimestamp(data.updatedAt),
  };
}

function canonicalReceipt(data) {
  return {
    legacyId: nullableInteger(data.legacyId),
    legacyTransactionId: nullableInteger(data.legacyTransactionId),
    transactionRemoteId: data.transactionRemoteId ?? null,
    filename: data.filename ?? null,
    size: nullableInteger(data.size ?? data.file?.size),
    sha256: String(data.sha256 ?? data.file?.sha256 ?? "").toLowerCase(),
    storageStatus: data.storageStatus ?? null,
  };
}

function assertCanonical(label, localValue, cloudValue) {
  const expected = JSON.stringify(localValue);
  const actual = JSON.stringify(cloudValue);
  if (expected !== actual) {
    throw new Error(
      `Cloud reconciliation failed: ${label} differs from the local source.`,
    );
  }
}

function recordManifest(records) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...records].sort((left, right) => left.id.localeCompare(right.id)),
      ),
      "utf8",
    )
    .digest("hex");
}

function safeName(value) {
  const name = String(value || "document")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-140);
  return name || "document";
}

function sniffMime(buffer, filename) {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-")
    return "application/pdf";
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  return String(filename).toLowerCase().endsWith(".csv")
    ? "text/csv"
    : "text/plain";
}

async function uploadReceipt(receipt, buffer, sha256) {
  const mimeType = sniffMime(buffer, receipt.filename);
  const pathname = `accounting-documents/${randomUUID()}-${safeName(receipt.filename)}`;
  const blob = await upload(pathname, new Blob([buffer], { type: mimeType }), {
    access: "private",
    handleUploadUrl: `${baseUrl}/api/accounting/sync/upload`,
    headers: { Authorization: `Bearer ${syncToken}` },
    contentType: mimeType,
    multipart: buffer.byteLength > 5 * 1024 * 1024,
  });
  return {
    name: receipt.filename,
    mimeType,
    size: buffer.byteLength,
    sha256,
    pathname: blob.pathname,
    url: blob.url,
    downloadUrl: blob.downloadUrl,
    etag: blob.etag,
  };
}

function cents(value) {
  if (value === null || value === undefined) return 0n;
  const [whole, fraction = ""] = String(value).replace(",", ".").split(".");
  const sign = whole.startsWith("-") ? -1n : 1n;
  return (
    sign *
    (BigInt(whole.replace("-", "")) * 100n +
      BigInt((fraction + "00").slice(0, 2)))
  );
}

function amountString(value) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function receiptManifest(items) {
  const lines = items
    .map((item) => `${item.remoteId}\t${item.size}\t${item.sha256}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(lines, "utf8").digest("hex");
}

async function main() {
  const local = readDesktopData();
  console.log(
    `Local source opened: ${local.accounts.length} accounts, ${local.transactions.length} transactions, ${local.receipts.length} receipts.`,
  );

  const bootstrap = [
    ...local.accounts.map(accountOperation),
    ...local.transactions.map(transactionOperation),
  ];
  for (let index = 0; index < bootstrap.length; index += 100) {
    await sync(bootstrap.slice(index, index + 100));
  }

  let cloud = await pullCloudState();
  const localReceiptManifest = [];
  for (const receipt of local.receipts) {
    if (!existsSync(receipt.path))
      throw new Error(
        `A receipt file is missing for local receipt ${receipt.id}.`,
      );
    const buffer = readFileSync(receipt.path);
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error(
        `Local receipt ${receipt.id} exceeds the 10 MiB safety limit.`,
      );
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const remoteId = uuidV5(`receipt:${receipt.id}`);
    const transactionRemoteId = uuidV5(`transaction:${receipt.transaction_id}`);
    localReceiptManifest.push({ remoteId, size: buffer.byteLength, sha256 });
    const existing = cloud.receipt.get(remoteId);
    if (existing && existing.operation !== "delete") {
      const expectedMetadata = {
        legacyId: receipt.id,
        legacyTransactionId: receipt.transaction_id,
        transactionRemoteId,
        filename: receipt.filename,
      };
      const actualMetadata = {
        legacyId: existing.data?.legacyId ?? null,
        legacyTransactionId: existing.data?.legacyTransactionId ?? null,
        transactionRemoteId: existing.data?.transactionRemoteId ?? null,
        filename: existing.data?.filename ?? null,
      };
      assertCanonical(
        `receipt ${receipt.id} metadata`,
        expectedMetadata,
        actualMetadata,
      );
    }
    if (
      existing?.operation !== "delete" &&
      existing?.data?.storageStatus === "stored" &&
      existing?.data?.sha256 === sha256 &&
      existing?.data?.size === buffer.byteLength
    ) {
      continue;
    }
    if (existing && existing.data?.sha256 && existing.data.sha256 !== sha256) {
      throw new Error(
        `Cloud receipt ${receipt.id} differs; refusing to overwrite it.`,
      );
    }
    const file = await uploadReceipt(receipt, buffer, sha256);
    await sync([
      {
        opId: operationId(
          "receipt",
          receipt.id,
          `content-${sha256.slice(0, 16)}`,
        ),
        entityType: "receipt",
        operation: "upsert",
        remoteId,
        version: existing?.version ?? 1,
        baseVersion: existing ? existing.version : 0,
        data: {
          legacyId: receipt.id,
          legacyTransactionId: receipt.transaction_id,
          transactionRemoteId,
          filename: receipt.filename,
          addedAt: receipt.added_at,
          file,
        },
      },
    ]);
  }

  cloud = await pullCloudState();
  const cloudTransactions = local.transactions.map((transaction) =>
    cloud.transaction.get(uuidV5(`transaction:${transaction.id}`)),
  );
  const cloudReceipts = local.receipts.map((receipt) => ({
    remoteId: uuidV5(`receipt:${receipt.id}`),
    row: cloud.receipt.get(uuidV5(`receipt:${receipt.id}`)),
  }));
  if (cloudTransactions.some((item) => !item || item.operation === "delete")) {
    throw new Error(
      "Cloud reconciliation failed: one or more transactions are missing.",
    );
  }
  if (
    cloudReceipts.some(
      (item) =>
        !item.row ||
        item.row.operation === "delete" ||
        item.row.data?.storageStatus !== "stored",
    )
  ) {
    throw new Error(
      "Cloud reconciliation failed: one or more receipt blobs are missing.",
    );
  }

  const accountRecords = local.accounts.map((account) => {
    const remoteId = uuidV5(`account:${account.account}`);
    const row = cloud.account.get(remoteId);
    if (!row || row.operation === "delete") {
      throw new Error(
        `Cloud reconciliation failed: account ${account.account} is missing.`,
      );
    }
    const expected = canonicalAccount(accountOperation(account).data);
    const actual = canonicalAccount(row.data);
    assertCanonical(`account ${account.account}`, expected, actual);
    return { id: remoteId, ...actual };
  });
  const transactionRecords = local.transactions.map((transaction, index) => {
    const remoteId = uuidV5(`transaction:${transaction.id}`);
    const expected = canonicalTransaction(
      transactionOperation(transaction).data,
    );
    const actual = canonicalTransaction(cloudTransactions[index].data);
    assertCanonical(`transaction ${transaction.id}`, expected, actual);
    return { id: remoteId, ...actual };
  });
  const receiptRecords = local.receipts.map((receipt, index) => {
    const remoteId = uuidV5(`receipt:${receipt.id}`);
    const actual = canonicalReceipt(cloudReceipts[index].row.data);
    const expected = {
      legacyId: receipt.id,
      legacyTransactionId: receipt.transaction_id,
      transactionRemoteId: uuidV5(`transaction:${receipt.transaction_id}`),
      filename: receipt.filename,
      size: localReceiptManifest[index].size,
      sha256: localReceiptManifest[index].sha256,
      storageStatus: "stored",
    };
    assertCanonical(`receipt ${receipt.id}`, expected, actual);
    return { id: remoteId, ...actual };
  });
  const localAmount = local.transactions.reduce(
    (sum, item) => sum + cents(item.amount),
    0n,
  );
  const cloudAmount = cloudTransactions.reduce(
    (sum, item) => sum + cents(item.data.amount),
    0n,
  );
  const cloudManifest = receiptManifest(
    cloudReceipts.map((item) => ({
      remoteId: item.remoteId,
      size: item.row.data.size,
      sha256: item.row.data.sha256,
    })),
  );
  const localManifest = receiptManifest(localReceiptManifest);
  if (localAmount !== cloudAmount || localManifest !== cloudManifest) {
    throw new Error(
      "Cloud reconciliation failed: totals or receipt checksums differ.",
    );
  }

  console.log(
    `Verified cloud copy: ${cloudTransactions.length} transactions totaling ${amountString(cloudAmount)}, ` +
      `${cloudReceipts.length} private receipts, manifest ${cloudManifest}. ` +
      `Account manifest ${recordManifest(accountRecords)}, transaction manifest ${recordManifest(transactionRecords)}, ` +
      `receipt metadata manifest ${recordManifest(receiptRecords)}.`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Accounting import failed.",
  );
  process.exitCode = 1;
});
