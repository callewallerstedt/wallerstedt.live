/**
 * Handelsbanken's "Kontoutdrag" Excel export (Internetbanken → Konto →
 * Exportera). Layout: a few header lines with the account name and number,
 * then Reskontradatum | Transaktionsdatum | Text | Belopp | Saldo.
 * Pure, so the browser can parse the file and send only rows.
 */

export type ImportedRow = { date: string; text: string; amountCents: number; balanceCents: number | null };

export type ParsedStatement = {
  accountNumber: string;
  accountName: string;
  balanceCents: number | null;
  rows: ImportedRow[];
  skippedPending: number;
};

function cell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function toCents(value: unknown) {
  if (typeof value === "number") return Math.round(value * 100);
  const text = cell(value).replace(/\s/g, "").replace(",", ".");
  const number = Number(text);
  return text && Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function parseHandelsbankenStatement(sheet: unknown[][]): ParsedStatement {
  const headerIndex = sheet.findIndex((row) =>
    row.some((value) => /^reskontradatum$/i.test(cell(value))) && row.some((value) => /^belopp$/i.test(cell(value))),
  );
  if (headerIndex < 0) {
    throw new Error("This does not look like a Handelsbanken account export (no Reskontradatum/Belopp columns).");
  }
  const header = sheet[headerIndex]!.map((value) => cell(value).toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const booked = col("reskontradatum");
  const traded = col("transaktionsdatum");
  const textCol = col("text");
  const amount = col("belopp");
  const balance = col("saldo");

  let accountNumber = "";
  let accountName = "";
  let balanceCents: number | null = null;
  for (const row of sheet.slice(0, headerIndex)) {
    const first = cell(row[0]);
    const match = /^(.*?)\s*((?:\d[\d\s-]{5,})\d)\s*$/.exec(first);
    if (!accountNumber && match && !/^\d{4}-\d{2}-\d{2}/.test(first) && !/^(period|kontoform)/i.test(first)) {
      accountNumber = match[2]!.replace(/\D/g, "");
      accountName = match[1]!.replace(/^\d+\s*-\s*/, "").replace(/\s*-\s*$/, "").trim();
    }
    for (const value of row) {
      const saldo = /^saldo:\s*(-?[\d\s.,]+)$/i.exec(cell(value));
      if (saldo) balanceCents = toCents(saldo[1]);
    }
  }

  const rows: ImportedRow[] = [];
  let skippedPending = 0;
  for (const row of sheet.slice(headerIndex + 1)) {
    const date = cell(row[booked]);
    const cents = toCents(row[amount]);
    if (cents == null) continue;
    // No booking date means "Prel": still pending, the bank sync covers those.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (cell(row[traded])) skippedPending += 1;
      continue;
    }
    rows.push({
      date,
      text: cell(row[textCol]).slice(0, 500),
      amountCents: cents,
      balanceCents: balance >= 0 ? toCents(row[balance]) : null,
    });
  }
  return { accountNumber, accountName, balanceCents, rows, skippedPending };
}
