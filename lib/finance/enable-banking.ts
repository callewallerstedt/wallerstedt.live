import { createSign } from "node:crypto";

import { AccountingError } from "@/lib/accounting/errors";

/**
 * Enable Banking (PSD2 account information) client. The app runs in
 * "restricted" production mode: it can only read the accounts the owner linked
 * in the Enable Banking control panel, which is exactly what a personal budget
 * needs and costs nothing.
 *
 * Docs: https://enablebanking.com/docs/api/reference/
 */

const API_ORIGIN = "https://api.enablebanking.com";

export type EbAmount = { currency: string; amount: string };

export type EbAccount = {
  uid: string;
  account_id?: { iban?: string | null; other?: { identification?: string } | null } | null;
  name?: string | null;
  details?: string | null;
  product?: string | null;
  currency?: string | null;
  cash_account_type?: string | null;
};

export type EbSession = {
  session_id: string;
  accounts: EbAccount[];
  aspsp?: { name: string; country: string };
  access?: { valid_until?: string };
};

export type EbBalance = {
  name?: string | null;
  balance_amount: EbAmount;
  balance_type?: string | null;
  reference_date?: string | null;
  last_change_date_time?: string | null;
};

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: EbAmount;
  credit_debit_indicator?: "CRDT" | "DBIT" | string | null;
  status?: "BOOK" | "PDNG" | string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  bank_transaction_code?: { description?: string | null } | null;
  merchant_category_code?: string | null;
  note?: string | null;
};

export type EbAspsp = {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
  maximum_consent_validity?: number;
};

/** Browser details of the owner when they are present. Unattended calls omit them. */
export type PsuContext = { ip?: string; userAgent?: string };

function configured() {
  const appId = process.env.ENABLE_BANKING_APP_ID?.trim() ?? "";
  let key = process.env.ENABLE_BANKING_PRIVATE_KEY?.trim() ?? "";
  if (key && !key.includes("BEGIN")) {
    // Accept a base64-encoded PEM as well as the raw file.
    key = Buffer.from(key, "base64").toString("utf8");
  }
  key = key.replace(/\\n/g, "\n");
  return { appId, key };
}

export function enableBankingConfigured() {
  const { appId, key } = configured();
  return Boolean(appId && key);
}

function jwt() {
  const { appId, key } = configured();
  if (!appId || !key) {
    throw new AccountingError(
      "Enable Banking is not configured (ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY).",
      503,
      "finance_not_configured",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ typ: "JWT", alg: "RS256", kid: appId });
  const payload = encode({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 });
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

export class EnableBankingError extends AccountingError {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly ebCode: string,
  ) {
    super(message, httpStatus >= 500 ? 502 : httpStatus === 401 || httpStatus === 403 ? 502 : httpStatus, "bank_error", {
      bankStatus: httpStatus,
      bankCode: ebCode,
    });
  }

  /** The consent is gone: the owner must reconnect with BankID. */
  get sessionExpired() {
    return (
      /EXPIRED_SESSION|CLOSED_SESSION|REVOKED_SESSION|INVALID_SESSION|SESSION_(EXPIRED|CLOSED)|ACCESS_EXPIRED|EXPIRED/i.test(this.ebCode) ||
      /session.*(expired|closed|revoked|not found)|consent.*(expired|revoked)/i.test(this.message)
    );
  }

  get rateLimited() {
    return this.httpStatus === 429 || /ASPSP_RATE_LIMIT|RATE_LIMIT/i.test(this.ebCode);
  }

  get wrongPeriod() {
    return /WRONG_TRANSACTIONS_PERIOD|DATE_FROM|PERIOD/i.test(this.ebCode);
  }
}

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  { body, psu }: { body?: unknown; psu?: PsuContext } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt()}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // With these, the bank treats the call as the owner being present, which
  // does not count against PSD2's four unattended reads per day.
  if (psu?.ip) headers["Psu-Ip-Address"] = psu.ip;
  if (psu?.userAgent) headers["Psu-User-Agent"] = psu.userAgent.slice(0, 500);

  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const record = (data ?? {}) as { error?: string; code?: string | number; message?: string; detail?: unknown };
    const code = String(record.error ?? record.code ?? response.status);
    const detail =
      typeof record.detail === "string"
        ? record.detail
        : record.detail
          ? JSON.stringify(record.detail).slice(0, 300)
          : "";
    const message = [record.message, detail].filter(Boolean).join(" — ") || text.slice(0, 300) || response.statusText;
    throw new EnableBankingError(`Bank API: ${message}`, response.status, code);
  }
  return data as T;
}

export async function listAspsps(country = "SE") {
  const data = await call<{ aspsps: EbAspsp[] }>("GET", `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
  return data.aspsps ?? [];
}

export async function startAuthorization(input: {
  aspspName: string;
  aspspCountry: string;
  state: string;
  redirectUrl: string;
  validUntil: Date;
  psu?: PsuContext;
}) {
  return call<{ url: string; authorization_id?: string }>("POST", "/auth", {
    psu: input.psu,
    body: {
      access: { valid_until: input.validUntil.toISOString() },
      aspsp: { name: input.aspspName, country: input.aspspCountry },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: "personal",
    },
  });
}

export async function createSession(code: string, psu?: PsuContext) {
  return call<EbSession>("POST", "/sessions", { body: { code }, psu });
}

export async function getSession(sessionId: string) {
  return call<{ status?: string; accounts?: string[]; access?: { valid_until?: string }; aspsp?: { name: string; country: string } }>(
    "GET",
    `/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export async function deleteSession(sessionId: string) {
  return call<unknown>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
}

export async function getAccountDetails(uid: string, psu?: PsuContext) {
  return call<EbAccount>("GET", `/accounts/${encodeURIComponent(uid)}/details`, { psu });
}

export async function getBalances(uid: string, psu?: PsuContext) {
  const data = await call<{ balances: EbBalance[] }>("GET", `/accounts/${encodeURIComponent(uid)}/balances`, { psu });
  return data.balances ?? [];
}

export async function getTransactions(uid: string, dateFrom: string, psu?: PsuContext) {
  const all: EbTransaction[] = [];
  const seenKeys = new Set<string>();
  let continuation: string | undefined;
  for (let page = 0; page < 60; page += 1) {
    const query = new URLSearchParams({ date_from: dateFrom });
    if (continuation) query.set("continuation_key", continuation);
    const data = await call<{ transactions: EbTransaction[]; continuation_key?: string | null }>(
      "GET",
      `/accounts/${encodeURIComponent(uid)}/transactions?${query}`,
      { psu },
    );
    all.push(...(data.transactions ?? []));
    const next = data.continuation_key ?? undefined;
    if (!next || seenKeys.has(next)) break;
    seenKeys.add(next);
    continuation = next;
  }
  return all;
}

/** Prefer what can actually be spent right now, then booked balances. */
const BALANCE_PREFERENCE = ["ITAV", "CLAV", "XPCD", "ITBD", "CLBD", "OPAV", "OTHR", "PRCD", "VALU"];

export function pickBalance(balances: EbBalance[]) {
  if (!balances.length) return null;
  const ranked = [...balances].sort((a, b) => {
    const ai = BALANCE_PREFERENCE.indexOf((a.balance_type ?? "").toUpperCase());
    const bi = BALANCE_PREFERENCE.indexOf((b.balance_type ?? "").toUpperCase());
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return ranked[0]!;
}

export function amountToCents(amount: string | number) {
  const value = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
