# Upgrade and rollback

## Before upgrading

Read the target changelog and release notes. Record current web/worker digest
references and PostgreSQL major version, run `scripts/backup.sh`, verify the
artifact, and complete a disposable restore drill. Preserve the old `.env` and
`APP_ENCRYPTION_KEY` separately. Never replace the encryption key as part of a
routine image upgrade.

## Upgrade

1. Download the target tag's Compose files and release digest records.
2. Put the new `@sha256:` image references in `.env`; keep old references in the
   change record.
3. Stop web and worker, leaving PostgreSQL and the volumes intact.
4. Pull images, run the one-shot migrator, then start web and worker.

```bash
docker compose -f compose.yaml -f compose.release.yaml stop web worker
docker compose -f compose.yaml -f compose.release.yaml pull web worker migrate
docker compose -f compose.yaml -f compose.release.yaml --profile tools run --rm migrate
docker compose -f compose.yaml -f compose.release.yaml up -d --wait web worker
```

Verify readiness, sign-in, one source of each configured kind, a manual refresh,
feed/search/filter/library actions, cache delivery, diagnostics, and a new backup.
Migrations are forward-only and must be run exactly once per target release.

## Rollback

If no migration ran, restore the old digest references and restart. After any
migration, do not run invented down SQL. Stop application traffic, preserve logs
and failed state, restore the verified pre-upgrade database and cache backup into
an isolated target, restore the old image digests and original encryption key,
verify integrity and source decryption, then reopen access. See the incident
runbooks in [operations and recovery](OPERATIONS_SECURITY_AND_RECOVERY.md).
