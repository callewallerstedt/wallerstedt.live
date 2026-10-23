# Grokbot: Wallerstedt Productions AB accounting

API revision: 1.1.0. Guide reviewed 2026-10-23. This document contains no credentials or account numbers and can be shared with the bot. Retrieve live discovery and OpenAPI on startup; capabilities and consent status can change.

## Start here

You operate the company's existing accounting system, not the owner's private-finance workspace. You have authenticated read/write tools for entries, the chart of accounts and evidence, plus reports, reconciliation and separate company-bank reads. Use the API rather than editing SQL or scraping the UI.

Obtain these existing settings from the owner's secret store, never from this guide:

```text
GROKBOT_ACCOUNTING_BASE=https://www.wallerstedt.live/api/accounting/<ACCOUNTING_ACCESS_KEY>/agent/v1
GROKBOT_ACCOUNTING_TOKEN=<ACCOUNTING_AGENT_API_TOKEN>
```

Send `Authorization: Bearer <token>` on every request. Use HTTPS. Do not reuse `ACCOUNTING_SYNC_TOKEN`, log credentials/private URLs, put tokens in query strings, follow cross-origin redirects with credentials, or embed credentials in exported HTML. The owner browser session also works; browser mutations require the same-origin Origin header. External bots should use the dedicated bearer token.

On startup call `GET /`, `GET /openapi`, `GET /schema`, and `GET /accounts`, relative to the base above. The OpenAPI JSON is suitable for generating tools. The companion `grokbot_accounting.py` is a dependency-free Python client and report exporter. The signed-in workspace `/agent/<accessKey>` has reports, charts, CSV downloads and company-bank status.

## Endpoint map

| Endpoint | Purpose |
| --- | --- |
| `GET /entries` | Search and paginate the active ledger |
| `POST /entries` | Create a complete, balanced entry; deduplicate retries |
| `GET /entries/{id}` | Current version, exact money and attached-document metadata |
| `PATCH /entries/{id}` | Partial version-checked update |
| `DELETE /entries/{id}` | Version-checked soft deletion; history remains |
| `GET /entries/{id}/revisions` | Full recorded revision history, including a deleted entry |
| `GET /accounts` | Complete active chart of accounts |
| `POST /accounts` | Create `{account,name,category?}` |
| `PATCH /accounts/{id}` | Update with current `version` |
| `DELETE /accounts/{id}` | Soft-delete an unused account with current `version` |
| `GET /balances?accounts=1930,1630,2893,1385` | All-history ledger balances, up to 20 BAS accounts |
| `GET /attachments` | Search evidence and find unassigned uploads |
| `POST /attachments` | Upload files or import a public HTTPS document |
| `PATCH /attachments/{id}` | Assign/move an existing document using `{entryId,version}` |
| `DELETE /attachments/{id}` | Version-checked soft deletion; retained bytes remain available to backups |
| `GET /attachments/{id}/download` | Original private file using the same bearer token |
| `GET /changes?after=0&limit=100` | Incremental audit events, including deletion tombstones |
| `GET /reports?dateFrom=2026-01-01&dateTo=2026-12-31` | Period report and readiness findings; dates are examples, not the registered fiscal year |
| `GET /reports?...&includeJournal=true` | Report plus expanded journal lines |
| `GET /reports?...&format=csv` | Download expanded journal CSV |
| `POST /reconcile` | Read-only comparison against a bank statement |
| `GET /bank` | Company consent/account status and last consent-attempt diagnostics |
| `GET /bank?banks=true` | Provider-supported business banks |
| `POST /bank` | Prepare a separate company BankID consent |
| `DELETE /bank` | Revoke a company consent using `{connectionId}` |
| `GET /bank/accounts/{id}/balances` | Actual bank balance snapshots |
| `GET /bank/accounts/{id}/transactions?dateFrom=...&dateTo=...` | Bank transactions with full provider pagination |
| `GET /guide` | Download this guide |

Account/entry/document path IDs are UUIDs from API responses. A BAS account number such as 1930 is not an account UUID. Bank account IDs are opaque provider UIDs and must be URL encoded. Bank account UIDs can change on reconnection; rediscover the authorized account using its IBAN, bank and currency rather than permanently assuming a UID.

## Search and extract everything needed

`GET /entries` accepts `q`, `dateFrom`, `dateTo`, `account`, `type`, `status`, `minAmount`, `maxAmount`, `missingReceipts`, `updatedSince`, `page`, and `limit`. Filters combine with AND. Free text searches descriptions, source, notes and account names. Account matching includes the VAT leg. Money filters compare the stored signed gross amount, not spending magnitude or net expense. Dates are inclusive ISO calendar dates. `updatedSince` is an inclusive ISO timestamp with timezone. Booleans are the strings `true`/`false` in the URL.

Examples:

```text
GET /entries?q=Adobe&dateFrom=2026-01-01&dateTo=2026-12-31&limit=250&page=1
GET /entries?account=2641&minAmount=0.01&missingReceipts=true
GET /attachments?unassigned=true&q=invoice&limit=250&page=1
```

Lists return `total`, `page`, `limit`, `hasMore` and `entries` or `documents`. Default 100, maximum 250 per page. Continue until `hasMore=false`. Never assume page one is the full ledger. Page-based browsing can move during concurrent edits; use reports for a consistent financial snapshot and `/changes` for incremental processing.

Persist `/changes`'s `nextCursor` only after processing that page. Audit events contain `entityType`, `remoteId`, `operation`, `version`, `data`, `cursor`, and `createdAt`. Delete events must remove the active item from your cache. Deduplicate event cursors; do not treat audit history as current rows or book events twice.

`GET /attachments` also accepts `entryId` or `unassigned=true/false`. Required receipts are missing when there is no active stored file, even if metadata exists. Reports additionally require the stored checksum. `receiptRequired=false` must reflect the actual evidence requirements, not be used to make a warning disappear.

## Money, journal lines and VAT

Use decimal strings or Python `Decimal`, never binary floating-point for accounting calculations. Entry and report amounts are strings such as `"1250.00"`. The older `/balances` endpoint retains numeric companions for compatibility; use `exact`. Numeric balance endpoints reject overflow; exact reports support larger totals. All local ledger amounts are SEK; foreign bank currencies need a reviewed SEK conversion and source evidence.

One stored entry has a debit account, a credit account, a signed gross amount, and an optional VAT split. These are expanded into journal lines for all new reports. With `vatAccount` 2640–2649, net is debited to the header's debit account, VAT is debited to the VAT account and gross is credited to the header's credit account. With 2610–2639, gross is debited, net is credited to the header's credit account and VAT is credited to its VAT account. If net is absent it is derived as gross minus VAT. Nonzero VAT without a supported account is rejected on journal writes. Gross/net/VAT must balance to the cent. Reverse-charge entries booked directly as debit 2645 / credit 2614 use no VAT split and must not be counted a second time.

Example only: a reviewed SEK purchase, net 100, input VAT 25, paid from 1930:

```json
{
  "bankText": "Supplier reference from statement",
  "bankAccountId": "stable-bank-account-scope",
  "bankTransactionId": "stable-booked-transaction-reference",
  "date": "2026-10-01",
  "description": "Office supplies, invoice reference",
  "debitAccount": 5410,
  "creditAccount": 1930,
  "amount": "125.00",
  "amountExVat": "100.00",
  "vatAmount": "25.00",
  "vatAccount": 2641,
  "type": "Utbetalning",
  "status": "Bokförd",
  "receiptRequired": true,
  "notes": "Source and reasoning for the classification"
}
```

Do not copy the example's account or VAT treatment blindly. Use evidence, current applicable rules and the actual chart. Add a missing account deliberately with its verified BAS name. Complex vouchers with several expense/VAT legs must be represented as reviewed balanced entries; the current model does not support arbitrary multi-line vouchers as one immutable voucher. Use negative signed entries consistently for reversals of an existing split. Unknown fields are rejected so bot typos cannot silently lose data.

All non-deleted ledger rows count in balances regardless of free-text status. Pending AI drafts live separately and are excluded until approved. Therefore a row labelled “review” in the ledger still affects balances. Keep incomplete work out of the ledger; journal writes require a real date, description, both accounts and balanced VAT. Existing incomplete legacy records are exposed by the readiness report; notes/evidence can still be repaired without silently changing financial fields.

Other canonical writable fields: `debitName`, `creditName`, `source`, `notes` (max 10,000 characters), `type`, `status`, and `receiptRequired`. Common types: `Utbetalning`, `Inbetalning`, `Överföring`, `Övrigt`; existing Swedish debt labels also occur. Do not infer P&L from payment type: owner loans and transfers are not revenue/expense merely because money moved. `/reports` uses account classes and expanded journal lines.

## Safe, efficient changes and idempotency

1. Search before creating and inspect full current entries/evidence before editing.
2. Prefer both `bankAccountId` and `bankTransactionId`. The pair identifies the bank event and distinguishes legitimate same-day payments with identical descriptions/amounts. Use a stable account scope such as bank + IBAN, not a temporary consent UID. Only use provider transaction references verified to be stable; do not invent IDs from a page index.
3. Existing historical entries may have no stable bank identity. Match them against evidence, then bind them with a version-checked PATCH including `bankText`, `bankAccountId`, and `bankTransactionId` before importing with stable IDs. Do not blindly repost history.
4. Without stable IDs, legacy deduplication uses normalized `bankText + date + amount`. This can collapse genuinely identical payments and must not be used where such payments are possible. Ambiguous historical matches return 409 rather than guessing.
5. A create response is 201 with `created=true` or 200 with `created=false`. An existing row returned on retry is not a newly booked transaction. A deleted identity stays reserved and returns a conflict rather than silently resurrecting it.
6. PATCH/DELETE require the exact current integer `version`. On 409 reread, compare changes, and recompute the intended patch. Never keep incrementing a guessed version or retrying stale data. Changing date, amount or stable bank identity requires `bankText`.
7. Retrying create after a timeout is safe with the same bank identity. Other mutations are version checked but not general idempotent operations: reread after an ambiguous timeout to determine whether they succeeded. Receipt upload retries can create separate metadata records; inspect existing documents/checksums before retrying.
8. Corrections to booked errors should have a clear reason and linked original evidence. Prefer explanatory correcting/reversing entries over erasing the economic event. Soft deletion is available for erroneous records and preserves revisions, but this system does not yet enforce a legally immutable numbered journal or period locks.
9. Rename an account with its current version. Used accounts cannot be renumbered or deleted through the web/API/sync guards. Do not renumber account references in SQL.

## Receipts and evidence

Send multipart `files` (up to 8) and optional `entryId` to `/attachments`, or JSON `{"url":"https://public.example/receipt.pdf","entryId":"<entry UUID>"}`. Maximum 10 MB per file and 40 MB per request; supported PDF, JPEG, PNG, TXT and CSV. Public URL import rejects private/internal hosts and checks redirects. Use multipart for private mail attachments rather than exposing the file publicly.

List documents to obtain IDs, checksums, storage status and authenticated download URLs. Entry responses' older relative `documents/.../download` field belongs to the owner API; for bearer use `/attachments/{documentId}/download` or the URL from the agent document list. Verify downloaded SHA-256 when archiving evidence. Keep original files. A metadata-only document is not a recovered receipt. Do not recreate or modify an original invoice to fill missing evidence.

The built-in accounting chat already has read-only Gmail search/read/import tools for owner-connected inboxes. Their app passwords are encrypted server-side and are not exposed by this API. Grokbot may use its separately authorized mail connector to obtain originals and upload them here. This accounting API cannot send email, initiate bank payments or file returns.

## Reports, charts and exports

Use `/reports` for a consistent database snapshot. It contains:

- `trialBalance.accounts`: exact opening, debit, credit, movement and closing per BAS account, with period entry counts.
- `profitAndLoss`: revenue (class 3), expenses and net financial/tax/result movements (classes 4–8), result and account detail.
- `balanceSheet.accounts`: recorded closing balances on classes 1–2. These need year-end/result allocation review.
- `monthly`: revenue, expenses, result and account-1930 movement for months with postings. Fill absent months with zero for a continuous chart; do not imply missing data was fetched.
- `vat`: input/output account movements and payable difference. Settlements and corrections are included; this is not a completed VAT return or its tax-base boxes.
- `readiness`: exact finding counts, up to 500 findings and up to 100 example IDs per code, explicit truncation flag, and external checklist. Retrieve underlying entries using the documented searches when examples are truncated.
- `pendingDrafts`, `latestBackup`, `generatedAt`, `period`, and the stated accounting basis.

Opening balances are all earlier dated records, not a certified fiscal-year rollover. Undated rows are excluded from period totals and reported as blockers. Report loading refuses more than 50,000 history rows rather than silently truncating. Year-end closing postings in class 8 can affect the reported result; inspect account details and classify operating/financial/closing movements appropriately for the desired presentation.

For the owner produce a report with: selected period, generation time, exact headline numbers, a monthly income/expense chart, result trend, balance/loan/VAT account details, bank-versus-ledger comparison at compatible dates, and a short issues/action list. Label available bank balance separately from booked balance and ledger balance. Use report strings for totals; floating-point values may be used only to position chart geometry. Escape all source text when generating HTML and never embed API tokens/private access URLs. Export a standalone HTML/PDF/CSV plus a JSON source snapshot. The companion Python client creates a self-contained HTML chart/table and JSON snapshot from this API without putting credentials in the report. The owner workspace also displays the chart and exact table directly.

## Statement reconciliation

Use signed movements: receipts into the selected bank account positive, payments negative. Provide statement opening/closing balances from the same account/currency/date interval, not an available balance with credit facilities. Example:

```json
{
  "account": 1930,
  "dateFrom": "2026-10-01",
  "dateTo": "2026-10-23",
  "openingBalance": "1000.00",
  "closingBalance": "875.00",
  "rows": [{"id":"statement-reference-1","date":"2026-10-01","amount":"-125.00"}]
}
```

This POST is read-only. It compares recorded ledger opening/movement/closing, statement arithmetic and transaction candidates by exact date/signed amount. `balancesAgree` alone is not full reconciliation. `reconciled=true` additionally requires supplied statement rows, correct arithmetic, no undated relevant entries, no unmatched rows and no ambiguous matching. Identical same-day amounts are reported as ambiguous; inspect references/evidence instead of guessing. A date/amount match is not proof of the business purpose. The comparison does not write a permanent reconciled flag or post missing rows.

## Handelsbanken company account

The company connection is separate from the Privat finance connection. Discover it with `/bank`; never automatically mix personal accounts into company books. Company-bank balance and transaction access was verified on 2026-10-23; always recheck live status and timestamps rather than treating that historical verification as current availability.

Initial setup/reconnection:

1. In Handelsbanken confirm the owner's power of attorney includes `Internet Företag – tilläggstjänst API Företag` (Min profil → Fullmakter → Självbetjäningstjänster).
2. If the Enable Banking production application uses restricted access, add the company account in the provider control panel's Linked accounts: Sweden → Handelsbanken → Business → Link. Private-account linking does not whitelist the company account.
3. Separately prepare the application's consent with `POST /bank`, body `{"bank":"Handelsbanken","country":"SE"}`. The owner opens the returned URL, approves the consent and completes BankID. Never sign on the owner's behalf.
4. The registered `/finance/callback` routes company-prefixed state to the separate company consent handler. `/bank` reports completed/failed attempt diagnostics. Check for the desired IBAN in an active company connection; do not assume success because BankID was completed.
5. Read `/bank/accounts/{uid}/balances` and `/transactions` for the requested interval. These reads do not book anything. The callback persists successful exchange data before final connection storage and can resume a persistence failure without repeating the bank-code exchange. Other failed/expired attempts need a fresh consent after the cause is fixed.

Bank responses include provider balance type, amount, currency and dates where supplied, plus `fetchedAt` (retrieval time, not a guarantee the bank has updated its data). ITAV is available; ITBD is interim booked. Preserve all types rather than choosing an available balance for bookkeeping reconciliation. Consent expires and can be revoked. Provider limits apply to unattended reads; reuse fetched data for the requested report and back off on limits instead of polling. This implementation exposes on-demand bank reads, not a continuously refreshed cache.

Bank transaction `amount` is signed based on CRDT/DBIT; it is null if direction is unknown. `bankTransactionId` is null if the provider gave no stable reference. Preserve raw source data and status. Only reviewed booked SEK rows should be candidates for ledger posting; pending entries, missing dates/IDs, FX and ambiguous duplicates require investigation. A fully paginated response means provider pagination completed; it cannot guarantee the bank supplied its entire historical archive.

## Errors and limits

JSON errors use `{ok:false,error,message,details?}`. Never classify a failed request as an empty ledger.

| Status | Action |
| --- | --- |
| 400 | Fix validation (`details.fields` or `invalid_journal` issues); unknown fields and invalid dates are rejected |
| 401 | Refresh the intended credential/session; never fall back to another account |
| 403 | Browser origin/permission issue; do not disable safeguards |
| 404 | Wrong/missing/deleted ID, invalid access key, or account outside active company consent |
| 409 | Reread versions/identity/history before deciding whether to retry |
| 413 | Split oversized requests/files |
| 422 | Narrow report/history or fix unsupported/invalid provider data; no partial total should be treated as complete |
| 429 | Back off; follow retry guidance, avoid unattended bank polling |
| 502/503 | Upstream/configuration outage; retain pending work and report the blocker |

Never send the owner a claim that a mutation completed until you have a success response or verified the resulting current version after a timeout.

## Daily/month-end/year-end operating routine

Daily when requested or scheduled by the owner: read changes since the last processed cursor, fetch necessary company-bank data within provider limits, compare candidate unbooked events against ledger history, find and attach original receipts, prepare complete balanced postings and verify saved versions. Produce an exception list for ambiguous transactions instead of silently discarding them.

Month end: select the actual reporting/VAT period, run the report and statement reconciliation, resolve unknown accounts, missing receipts and status warnings, inspect duplicates and pending drafts, and check backup status. Store the report snapshot and original statements in the owner's authorized archive. Review 1930 bank, 1630 tax, 2893 owner balances, 1385 capital insurance and applicable receivable/payable accounts using their statements; verify account classification and tax treatment rather than applying generic income rules.

Year end: first confirm registered fiscal dates, accounting method, VAT periods, organisation details, prior closing balances and whether K2/K3 applies. Review accruals, fixed assets/depreciation, receivables/payables, owner transactions, insurance, foreign/EU sales and purchases, non-deductible expenses, tax adjustments and year-end result allocation. Then prepare INK2/INK2R/INK2S and the annual report with suitable external filing software or an accountant, validate and submit through the applicable channels, and retain submission receipts. This system does not perform those submissions or certify readiness.

## Present limits compared with Fortnox/Visma/Spiris

Implemented: bank account-information reads, ledger/evidence search and CRUD, revision/audit history, concurrency checks, bank identities for retry safety, exact period reports/chart data, CSV/JSON journal exports, read-only reconciliation, private document storage, existing desktop sync, AI draft/approval and Gmail tools in the owner chat, verified backup infrastructure.

Still missing: a general multi-line immutable numbered journal, locked fiscal periods and certified rollover/opening-balance model; a full invoice/credit-note and supplier/customer subledger; payment initiation; payroll/AGI; asset register/depreciation schedules; complete VAT/EU/OSS returns; validated SIE import/export; year-specific SRU mapping/INK2 production and electronic filing; annual-report production/signing/filing. The readiness report deliberately never asserts `declarationReady=true` while these external completion steps remain.

Do not equate overall debit/credit equality with correct tax treatment or complete records. Do not remove evidence requirements or reclassify questionable posts merely to make the report look clean. Explain unresolved items with the exact entry IDs, sources and next action.

## Source references

- INK2 consists of INK2, INK2R and INK2S: https://www.skatteverket.se/4.39f16f103821c58f680006188.html
- Annual report and filing: https://bolagsverket.se/foretag/aktiebolag/arsredovisningforaktiebolag.759.html
- System documentation and treatment history: https://www.bfn.se/wp-content/uploads/vl13-2-bokforing.pdf
- Provider reference: https://enablebanking.com/docs/api/reference/
- Restricted-account linking and separate authorization: https://enablebanking.com/docs/api/linked-accounts/
- Handelsbanken business mandate: https://tilisy.enablebanking.com/guides/SE/Handelsbanken/

Verify current rules and company-specific applicability before tax decisions; these source links are not a substitute for reviewing the actual books.
