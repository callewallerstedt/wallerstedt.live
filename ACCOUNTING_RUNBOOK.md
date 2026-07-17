# Private accounting operations

This runbook intentionally contains no access keys, passwords, sync tokens, or private URLs.

## Production schema

Database changes are committed as versioned Prisma migrations. Before promoting accounting code, pull the linked Vercel environment into `.env.local`, then run:

```powershell
npm.cmd run prisma:status:local
npm.cmd run prisma:deploy:local
```

Do not use `prisma db push` for routine production releases. It was used once to bootstrap the empty database; the matching baseline migration was then marked as applied.

## One-time desktop import

The importer reads SQLite in read-only mode, pushes deterministic UUIDv5 records, uploads receipts privately, and refuses to finish unless the cloud copy reconciles:

```powershell
npm.cmd run accounting:import
```

Keep the original SQLite file and the pre-migration archive until a cloud backup and desktop round-trip have both been verified.

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
