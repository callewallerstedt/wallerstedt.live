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

The chat agent can search connected Gmail inboxes read-only (`gmail.readonly`) to find receipts and attach them to ledger posts. Multiple accounts (up to 4) can be connected; refresh tokens are stored AES-256-GCM encrypted in `AccountingGmailAccount`.

One-time Google Cloud setup:

1. Create a Google Cloud project and enable the **Gmail API**.
2. Configure the OAuth consent screen (External, publish or add both Gmail addresses as test users) with the `.../auth/gmail.readonly` scope.
3. Create an **OAuth client ID** of type *Web application* and register this exact redirect URI (it contains the private vault key, so treat the console entry as secret):
   `https://<domain>/api/accounting/<accessKey>/gmail/callback`
4. Set the environment variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel. Token encryption reuses `ACCOUNTING_SESSION_SECRET` unless a dedicated `ACCOUNTING_GMAIL_TOKEN_SECRET` (32+ chars) is set.

Connecting and disconnecting accounts is done in the app under *Mer → Gmail-konton* while signed in as the owner. If Google access is revoked externally, the account shows "Behöver anslutas igen" and can be reconnected in place. Disconnecting deletes the stored token; also revoke the grant at myaccount.google.com/permissions for completeness.

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
