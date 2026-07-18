# Private accounting operations

This runbook intentionally contains no access keys, passwords, sync tokens, or private URLs.

## Production schema

Database changes are committed as versioned Prisma migrations. Before promoting accounting code, pull the linked Vercel environment into `.env.local`, then run:

```powershell
npm.cmd run prisma:status:local
npm.cmd run prisma:deploy:local
```

Do not use `prisma db push` for routine production releases. It was used once to bootstrap the empty database; the matching baseline migration was then marked as applied.

The runtime accepts only direct `postgres://` or `postgresql://` connections. Prisma Accelerate/Data Proxy URLs are deliberately ignored so ordinary application traffic cannot consume a separate Prisma transfer quota. Public traffic is recorded by Vercel Analytics; the legacy `/api/collect` and `/api/analytics` database writers are permanent no-ops.

## One-time desktop import

The importer reads SQLite in read-only mode, pushes deterministic UUIDv5 records, uploads receipts privately, and refuses to finish unless the cloud copy reconciles:

```powershell
npm.cmd run accounting:import
```

Keep the original SQLite file and the pre-migration archive until a cloud backup and desktop round-trip have both been verified.

## Gmail for the AI agent

The chat agent can search connected Gmail inboxes read-only to find receipts and attach them to ledger posts. It uses Gmail's IMAP endpoint with per-account **Google app passwords** — no Google Cloud project, OAuth client, or API keys are required. Full Gmail search syntax still works via the `X-GM-RAW` IMAP extension.

Connecting an inbox (done entirely in the app under *Mer → Gmail-konton* while signed in as the owner):

1. On the Gmail account, enable 2-Step Verification (Google account → Security), then create an app password at myaccount.google.com/apppasswords.
2. Paste the address and the 16-character app password into the connect form. The login is verified against `imap.gmail.com` before anything is stored.

Up to 4 accounts can be connected. App passwords are stored AES-256-GCM encrypted in `AccountingGmailAccount`; encryption reuses `ACCOUNTING_SESSION_SECRET` unless a dedicated `ACCOUNTING_GMAIL_TOKEN_SECRET` (32+ chars) is set — no other configuration is needed. If Google revokes an app password, the account shows "Behöver anslutas igen" and can be reconnected in place with a fresh password. Disconnecting deletes the stored secret; also delete the app password at myaccount.google.com/apppasswords for completeness.

## Backups and recovery

The daily cron and the owner backup action create a private JSON snapshot, read it back, and verify the SHA-256 of the snapshot and every stored document before recording `verified`. Snapshot pruning keeps recent daily copies and long-term monthly/yearly copies. Registered document blobs are never physically deleted, including rejected AI uploads, so an older verified snapshot cannot be invalidated by later cleanup.

Use the restore command in verification mode first:

```powershell
npm.cmd run accounting:restore -- --pathname "accounting-backups/snapshots/...json" --sha256 "<full 64-character snapshot hash>"
```

For a restore drill, set `DATABASE_URL` to a separately migrated, empty staging database and then run:

```powershell
npm.cmd run accounting:restore -- --pathname "accounting-backups/snapshots/...json" --sha256 "<full 64-character snapshot hash>" --restore-to-empty-database --confirm-empty-target
```

The write path refuses a non-empty target and requires the full checksum plus both explicit restore flags. Never point it at the active production database for a rehearsal. The JSON snapshot references and verifies private document objects rather than embedding their bytes, so the desktop's full ZIP archives and an off-provider encrypted copy remain part of the recovery plan.
