# Database and domain model

M02 introduces the first durable PostgreSQL schema. Prisma owns the checked
schema, migration, generated client boundary, and repositories under
`packages/db`. PostgreSQL remains the source of truth; Redis contains no durable
domain state.

## Applying the migration

Set `DATABASE_URL` to the target PostgreSQL database, then run:

```bash
pnpm --filter @mirthspool/db prisma:validate
pnpm --filter @mirthspool/db prisma:migrate:deploy
```

The initial migration creates enums, tables, foreign keys, idempotency
constraints, and query indexes. It has no backfill and is intended to run against
the empty schema from M01. PostgreSQL takes normal catalog and table locks while
creating objects; on an empty M01 database there are no large-table rewrite or
long-running index concerns.

Integration tests apply the migration independently to two clean databases: one
representing the previous milestone's empty schema and one representing a fresh
installation.

## Rollback and recovery

The initial migration is not reversed automatically. Dropping its tables would
destroy imported content and user state. For a production rollback:

1. stop the web and worker processes;
2. restore the pre-migration PostgreSQL backup into a new database;
3. point `DATABASE_URL` at the restored database; and
4. deploy the previous M01 application version.

For a disposable development database only, `docker compose down --volumes`
removes local PostgreSQL and Redis data so the migration can be replayed from an
empty database.

## Domain boundaries

- `ContentItem` is canonical content; `SourcePost` is a provider occurrence.
- Provider IDs are opaque strings and are unique only with their source.
- `upsertNormalizedContent` creates content, occurrence, media metadata, and the
  primary occurrence link in one serializable transaction.
- Repositories receive an explicit Prisma client or transaction. UI modules do
  not issue ORM calls directly.
- Source removal is soft by default (`deletedAt` is set, `enabled = false`, and
  `status = PAUSED`).
  Occurrences and ingestion history restrict hard source deletion.
- Explicit content deletion cascades occurrences, media metadata, tags, and user
  actions. User deletion cascades sessions and actions. Cache eviction changes
  media metadata without deleting attribution.
- Raw provider payload storage is disabled by default. An explicitly enabled
  policy scrubs secret-shaped keys and enforces a maximum serialized byte size.
- `Source.configJson` rejects secret-shaped keys. Credentials have a dedicated
  AES-256-GCM encrypted-payload model with a versioned envelope.

## M04 source-management migration

Migration `20260722030000_source_management` adds nullable `Source.deletedAt`,
an index used to exclude soft-deleted sources, and a unique constraint on
`(sourceId, kind, label)` for idempotent credential rotation. M03 exposed no
source or credential writer, so no backfill or duplicate cleanup is required.
The nullable column is a metadata-only addition; index creation takes normal
PostgreSQL catalog/table locks and should be scheduled normally for unexpectedly
large pre-release databases.

There is no destructive down migration. To roll back a production deployment,
stop the application, restore the pre-M04 database backup into a new database,
deploy the M03 image, and repoint `DATABASE_URL`. Do not drop the new column or
constraint in place after source credentials have been written.

## Naming notes

The schema uses `AppSetting` rather than the document's generic “setting” label
to avoid ambiguity with runtime environment configuration. `TagSource` makes the
documented admin/provider/rule tag provenance explicit. `DuplicateGroup` is a
small first-class table so the optional group reference has referential integrity.
Authentication-compatible `User` and `Session` fields are present, but login,
password hashing, and session issuance are deliberately not implemented in M02.

## M13 media-cache migration

Migration `20260723010000_media_cache_indexes` makes non-null media storage keys
unique and adds the bounded eviction scan index on cache state, expiry, and last
access. Existing deployments have no cached objects because M12 had no cache
writer, so the uniqueness check requires no backfill or deduplication. Index and
constraint creation take ordinary PostgreSQL locks; schedule the migration during
a normal deployment window if a pre-release database has an unusually large
`MediaAsset` table.

There is no destructive down migration. For rollback, stop web and worker,
deploy the M12 images, and leave the additive index and unique constraint in
place. Cached files may be removed after the worker is stopped; their database
metadata and source URLs remain non-authoritative for M12. If exact schema
reversal is required, restore the pre-M13 database backup into a new database
instead of dropping constraints in place.

## Synthetic seed

Run the deterministic development seed with:

```bash
pnpm --filter @mirthspool/db prisma:seed
```

It uses fixed UUIDs and timestamps plus `example.invalid` URLs. It contains no
real posts, people, credentials, cookies, or tokens and is safe to run repeatedly.
