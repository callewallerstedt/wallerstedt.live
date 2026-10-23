/** Public contract: no credentials, private company data, or environment values. */
const money = { type: "string", pattern: "^-?[0-9]{1,16}(\\.[0-9]{1,2})?$", example: "1250.00" };
const date = { type: "string", format: "date" };
const uuid = { type: "string", format: "uuid" };
const nullableAccount = { type: ["integer", "null"], minimum: 1000, maximum: 9999 };
export const agentEntryProperties = {
  bankText: { type: "string", minLength: 1, maxLength: 500 },
  bankAccountId: { type: "string", maxLength: 200 }, bankTransactionId: { type: "string", maxLength: 200 },
  date: { ...date, type: ["string", "null"] }, amount: { anyOf: [money, { type: "number" }] },
  description: { type: ["string", "null"], maxLength: 500 },
  debitAccount: nullableAccount, creditAccount: nullableAccount, vatAccount: nullableAccount,
  debitName: { type: ["string", "null"], maxLength: 200 }, creditName: { type: ["string", "null"], maxLength: 200 },
  amountExVat: { anyOf: [money, { type: ["number", "null"] }] }, vatAmount: { anyOf: [money, { type: ["number", "null"] }] },
  type: { type: ["string", "null"], maxLength: 100 }, source: { type: ["string", "null"], maxLength: 300 },
  notes: { type: ["string", "null"], maxLength: 10_000 }, status: { type: ["string", "null"], maxLength: 100 }, receiptRequired: { type: "boolean" },
};

export function accountingOpenApi(base: string) {
  const parameter = (name: string, schema: object, required = false) => ({ name, in: "query", required, schema });
  const period = [parameter("dateFrom", date, true), parameter("dateTo", date, true)];
  const paging = [parameter("page", { type: "integer", minimum: 1, maximum: 1_000_000, default: 1 }), parameter("limit", { type: "integer", minimum: 1, maximum: 250, default: 100 })];
  const json = (schema: object) => ({ required: true, content: { "application/json": { schema } } });
  const object = (properties: object, required: string[] = []) => ({ type: "object", properties, required });
  const version = { type: "integer", minimum: 1 };
  const versionBody = json(object({ version }, ["version"]));
  const accountFields = { account: { type: "integer", minimum: 1000, maximum: 9999 }, name: { type: "string", minLength: 1, maxLength: 200 }, category: { type: ["string", "null"], maxLength: 100 } };
  const responses = {
    "200": { description: "Success. JSON money is returned as exact decimal strings in reports and entries.", content: { "application/json": { schema: { type: "object" } } } },
    "400": { description: "Invalid input; inspect error and details.fields." }, "401": { description: "Authentication required." },
    "404": { description: "Not found or invalid access key." }, "409": { description: "Version, identity or account-use conflict; read current state before retrying." },
    "413": { description: "Request exceeds the byte limit." }, "422": { description: "Unsupported report/bank request; no partial result." },
    "429": { description: "Rate limited; back off." }, "502": { description: "Upstream bank failure; inspect details.bankCode." }, "503": { description: "Service not configured or unavailable." },
  };
  const op = (operationId: string, summary: string, extra: object = {}) => ({ operationId, summary, responses, ...extra });
  const pathId = (format = true) => ({ name: "id", in: "path", required: true, schema: format ? uuid : { type: "string" } });
  return {
    openapi: "3.1.0", info: { title: "Wallerstedt company accounting", version: "1.1.0", description: "Agent read/write API. Reports are working papers; external declaration and annual-report completion remains necessary." },
    servers: [{ url: base }], security: [{ agentBearer: [] }],
    components: { securitySchemes: { agentBearer: { type: "http", scheme: "bearer", description: "Dedicated ACCOUNTING_AGENT_API_TOKEN, not a sync token. Owner browser session is also accepted." } } },
    paths: {
      "/": { get: op("discover", "Discover capabilities") },
      "/schema": { get: op("writableSchema", "Writable field contract") },
      "/openapi": { get: op("openApi", "This OpenAPI document") },
      "/guide": { get: op("downloadGuide", "Download the Grokbot operating guide", { responses: { "200": { description: "Markdown file", content: { "text/markdown": { schema: { type: "string" } } } } } }) },
      "/entries": {
        get: op("listEntries", "Search all active ledger entries; filters combine with AND", { parameters: [...paging,
          ...["q", "type", "status"].map((name) => parameter(name, { type: "string" })), ...period.map((p) => ({ ...p, required: false })),
          parameter("account", { type: "integer", minimum: 1000, maximum: 9999 }), parameter("minAmount", money), parameter("maxAmount", money),
          parameter("missingReceipts", { type: "boolean" }), parameter("updatedSince", { type: "string", format: "date-time" }),
        ] }),
        post: op("createEntry", "Create or deduplicate a balanced, complete ledger entry. Prefer stable bankAccountId + bankTransactionId", { requestBody: json(object({ ...agentEntryProperties, date }, ["bankText", "date", "amount", "description", "debitAccount", "creditAccount"])), responses: { ...responses, "201": { description: "Entry created." } } }),
      },
      "/entries/{id}": { parameters: [pathId()], get: op("getEntry", "Read an entry and attached-document metadata"),
        patch: op("updateEntry", "Partial update; current version required. Changing date/amount/identity requires bankText", { requestBody: json(object({ ...agentEntryProperties, version }, ["version"])) }),
        delete: op("deleteEntry", "Soft-delete with history preserved; prefer correction entries for booked errors", { requestBody: versionBody }) },
      "/entries/{id}/revisions": { parameters: [pathId()], get: op("entryHistory", "Read every recorded entry revision, including deleted entries") },
      "/accounts": { get: op("listAccounts", "Read the full active chart of accounts"), post: op("createAccount", "Create a BAS account", { requestBody: json(object(accountFields, ["account", "name"])) }) },
      "/accounts/{id}": { parameters: [pathId()], patch: op("updateAccount", "Update an account; used accounts cannot be renumbered", { requestBody: json(object({ ...accountFields, version }, ["version"])) }), delete: op("deleteAccount", "Soft-delete an unused account", { requestBody: versionBody }) },
      "/balances": { get: op("accountBalances", "All-history debit-minus-credit balances; use reports for period balances", { parameters: [parameter("accounts", { type: "string", example: "1930,1630,2893,1385" })] }) },
      "/attachments": {
        get: op("listAttachments", "Search stored and metadata-only documents", { parameters: [...paging, parameter("q", { type: "string" }), parameter("entryId", uuid), parameter("unassigned", { type: "boolean" })] }),
        post: op("uploadAttachments", "Attach up to 8 files, max 10 MB each, 40 MB total; or import a public HTTPS file", { requestBody: { required: true, content: {
          "application/json": { schema: object({ url: { type: "string", format: "uri" }, filename: { type: "string" }, entryId: uuid }, ["url"]) },
          "multipart/form-data": { schema: object({ files: { type: "array", maxItems: 8, items: { type: "string", format: "binary" } }, entryId: uuid }, ["files"]) },
        } } }),
      },
      "/attachments/{id}": { parameters: [pathId()], patch: op("assignAttachment", "Attach or move a stored receipt without re-uploading", { requestBody: json(object({ version, entryId: uuid }, ["version", "entryId"])) }), delete: op("deleteAttachment", "Soft-delete document metadata; original blob retained for backups", { requestBody: versionBody }) },
      "/attachments/{id}/download": { parameters: [pathId()], get: op("downloadAttachment", "Download original private bytes using the same bearer token") },
      "/changes": { get: op("changes", "Incremental audit events including tombstones; persist nextCursor after processing", { parameters: [parameter("after", { type: "string", pattern: "^[0-9]{1,18}$", default: "0" }), paging[1]] }) },
      "/reports": { get: op("report", "Consistent trial balance, P&L, recorded balance sheet, monthly chart data, VAT movements and readiness findings", { parameters: [...period, parameter("includeJournal", { type: "boolean", default: false }), parameter("format", { type: "string", enum: ["json", "csv"], default: "json" })] }) },
      "/reconcile": { post: op("reconcile", "Read-only statement comparison, not automatic booking", { requestBody: json(object({ account: accountFields.account, dateFrom: date, dateTo: date, openingBalance: money, closingBalance: money, rows: { type: "array", maxItems: 10_000, items: object({ id: { type: "string" }, date, amount: money }, ["id", "date", "amount"]) } }, ["account", "dateFrom", "dateTo", "openingBalance", "closingBalance"])) }) },
      "/bank": { get: op("businessBankStatus", "Read separate company consents; banks=true lists supported business banks", { parameters: [parameter("banks", { type: "boolean" })] }),
        post: op("connectBusinessBank", "Prepare business consent URL; owner completes BankID", { requestBody: json(object({ bank: { type: "string" }, country: { type: "string", default: "SE" } }, ["bank"])) }),
        delete: op("disconnectBusinessBank", "Revoke a company consent at the provider", { requestBody: json(object({ connectionId: { type: "string" } }, ["connectionId"])) }) },
      "/bank/accounts/{id}/balances": { parameters: [pathId(false)], get: op("businessBankBalances", "Read provider balance snapshots and preserve balance type, currency and timestamps") },
      "/bank/accounts/{id}/transactions": { parameters: [pathId(false)], get: op("businessBankTransactions", "Read complete provider pagination for a date range; pending/missing IDs require review", { parameters: period }) },
    },
  };
}
