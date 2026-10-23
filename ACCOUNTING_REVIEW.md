# Accounting review — 2026-10-23

This is an engineering capability review, not a declaration signoff. Company-bank access was verified live, and a read-only database audit was run; no historical ledger entries or original evidence were automatically rewritten. Detailed findings are kept in the ignored `private-data/accounting-audit.json`, not in Git.

## Results

The live ledger's aggregate debit/credit difference was zero. That does not establish correct classification, tax treatment or completeness. The audit found missing required receipts, references to accounts absent from the active chart, status labels requiring review, a possible duplicate and pending AI drafts. The latest available backup was recorded verified. The new report exposes exact counts, example IDs and follow-up searches so an agent can work on the underlying evidence.

The Handelsbanken company consent is isolated from private finance. The owner linked the business account in Enable Banking's restricted application and completed a separate application consent; actual company balance and transaction reads then succeeded. This is on-demand account information, not payment initiation or an assurance of continuous real-time updates.

## Capabilities and gaps

| Area | Assessment after this change |
| --- | --- |
| Agent API | Discovery, OpenAPI, exact field guide, paginated search and current entry reads |
| Ledger changes | Create/update/soft-delete, optimistic versions, revision and audit history; stable bank identities distinguish identical payments |
| Posting integrity | Common service rejects incomplete/unbalanced journal writes, including unsupported nonzero VAT; exact journal arithmetic shared with reports |
| Chart of accounts | Agent CRUD; used account renumber/delete blocked through service and sync paths |
| Evidence | Private upload, listing, download, reassignment, soft deletion and checksum metadata; missing files stay visible |
| Bank | Separate company consent, balance types/timestamps, transactions, explicit provider pagination failures, durable callback lifecycle and safe diagnostics |
| Reporting | Consistent period snapshot, trial balance, account-based P&L, recorded balance sheet, VAT movements, monthly charts, exact tables and CSV/JSON exports |
| Reconciliation | Read-only statement arithmetic, opening/closing comparison and candidate row matching with explicit ambiguity |
| Agent tutorial | Shareable `public/GROKBOT_ACCOUNTING_GUIDE.md` and standard-library Python client/standalone HTML exporter |
| Recovery | Existing private verified backups and restore drill tooling; no new claim that a restore drill was completed in this review |
| Missing accounting foundation | General multi-line immutable numbered vouchers, fiscal-period locks, certified year-end rollover/opening balances |
| Missing operations modules | Customer/supplier invoice subledgers, credit-note lifecycle, payment execution, payroll/AGI, fixed-asset register |
| Missing filing modules | Complete VAT/EU/OSS return production, validated SIE import/export, applicable-year SRU/INK2 mapping and filing, annual-report production/signature/filing |

Fortnox and Spiris advertise bank matching and broader invoicing/declaration workflows; this system has useful agent access but does not yet offer full feature parity. No SIE/SRU file or tax submission is labelled complete by this implementation.

## System documentation

The PostgreSQL `AccountingEntry` headers and optional VAT fields expand into journal lines in `lib/accounting/balances.ts`. `service.ts` records mutations, snapshots each version in `AccountingEntryRevision` and writes incremental `AccountingAuditEvent` records. Agent creates reserve fingerprints in `AccountingSyncOperation`; stable external account/transaction references are preferred over the legacy date/text/amount fallback. Desktop sync and AI approvals use the same journal write service. Files are private blob objects referenced by `AccountingDocument`; retained original bytes and verified snapshots support recovery. Company bank consents/state are separate from `FinanceBankSession` and do not write ledger entries automatically. The registered shared callback routes namespaced state to the correct consent lifecycle.

The owner can obtain readable reports and CSV from Agent vault, or use the API/Python client to export a standalone HTML report that can be printed. Original documents can be downloaded with authenticated receipt URLs. Keep this documentation, the applicable chart of accounts, originals and report snapshots with the company's records; define an off-provider archive/retention process appropriate to the company. The engineering repository is not a substitute for that archive.

## Required next accounting work

Confirm company fiscal dates and prior closing balances; resolve the live evidence/account/status findings; investigate duplicates against bank references and originals; reconcile bank, tax, owner-loan, insurance and other relevant balances; review year-end adjustments and tax classifications. Complete and validate INK2/INK2R/INK2S and the annual report externally, then retain submission receipts. Overall balance equality alone cannot close these items.

## Verification and security maintenance

Focused accounting checks cover journal/VAT expansion, exact large/negative amounts,
period boundaries, hidden offsetting imbalances, readiness findings, reconciliation
ambiguity, UTF-8 request byte limits, route authentication, OpenAPI coverage and
consent callback recovery. Related OS, private-finance and notification checks
also passed. The shareable Python client has offline HTML-escaping and credential-
redirect checks. An isolated production build is required before promotion.

Non-breaking dependency updates and the stale PostCSS override were corrected.
`npm audit --omit=dev` reports zero production dependency vulnerabilities at review
time. Five high-severity development-tool dependency findings remain in the
ESLint/fast-glob/micromatch/braces chain; npm proposes a breaking downgrade of
eslint-config-next as its automatic fix, which was not applied. This is not a
claim that the full dependency tree has no vulnerabilities.

## Sources consulted

- [Skatteverket: INK2, INK2R and INK2S](https://www.skatteverket.se/4.39f16f103821c58f680006188.html)
- [Bolagsverket: annual reporting](https://bolagsverket.se/foretag/aktiebolag/arsredovisningforaktiebolag.759.html)
- [BFN: bookkeeping, system documentation and treatment history](https://www.bfn.se/wp-content/uploads/vl13-2-bokforing.pdf)
- [Fortnox bookkeeping features](https://www.fortnox.se/produkt/bokforingsprogram)
- [Spiris bookkeeping/invoicing support](https://www.spiris.se/support/bokforing-fakturering)
- [Enable Banking account linking](https://enablebanking.com/docs/api/linked-accounts/)
- [Enable Banking API contract](https://enablebanking.com/docs/api/reference/)
