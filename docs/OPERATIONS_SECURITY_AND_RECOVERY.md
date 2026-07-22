# Operations, security, and recovery

## Health, metrics, and diagnostics

`/api/health/live` proves that the web process can respond. `/api/health/ready`
requires PostgreSQL, Redis, and readable media storage, but returns only stable
dependency names and status codes. The worker starts only after PostgreSQL and
Redis are ready, checks writable storage, and maintains a bounded heartbeat used
by its container health check.

Administrators can read `/api/admin/diagnostics` (sanitized JSON) and
`/api/admin/metrics` (Prometheus text). Neither endpoint is public. Metrics use
fixed queue/status/bucket labels and never source IDs, user IDs, URLs, job IDs,
or error messages. The snapshot covers HTTP status/latency buckets, queue depth,
ingestion outcome/provider requests/imports/duplicates/retries, source failures,
cache bytes, and database/storage health. Logs apply recursive key redaction and
remove URL credentials, queries, and fragments before serialization.

## Backup contract

Run `scripts/backup.sh /absolute/private/backup-root` while all Compose services
are healthy, then run `scripts/verify-backup.sh BACKUP_DIRECTORY`. The artifact
contains a compressed native PostgreSQL dump, cached-media bytes, checksums,
the PostgreSQL tool version, and a non-secret service inventory. Treat the whole
artifact as sensitive: source credentials remain encrypted but user and source
metadata do not.

The database password, `.env`, and `APP_ENCRYPTION_KEY` are deliberately not in
the artifact. Store the encryption key separately with access controls and test
both recoveries. The database artifact without the original key restores data
but source credential decryption fails in a controlled manner; do not overwrite
credentials or rotate blindly in that state.

Restore only into a new, isolated Compose project whose migrations have created
an empty schema:

1. Start PostgreSQL, Redis, web, and worker with the original external
   `APP_ENCRYPTION_KEY` supplied securely.
2. Run `MIRTHSPOOL_RESTORE_CONFIRM=EMPTY_TARGET scripts/restore.sh BACKUP`.
3. The script verifies checksums and dump readability, refuses a non-empty user
   table, restores database and cache bytes, reconciles missing cache objects,
   and prints integrity counts.
4. Sign in, decrypt one configured source by running a validation, load feed and
   library actions, and perform a manual source refresh. Repeat once without the
   key in an isolated disposable project and confirm startup/configuration or
   credential decryption fails without altering the restored database.

Backups are valid only after this clean-restore exercise succeeds. Record image
digests, PostgreSQL version, counts (not private names), checksums, and date.
For a disposable restore drill, the guarded `credential-recovery-check.ts`
fixture can create and verify one synthetic encrypted credential; it refuses to
run unless `MIRTHSPOOL_RECOVERY_FIXTURE=I_UNDERSTAND_TEST_DATA` is set.

## Retention and failure injection

Hourly maintenance reports a dry-run plan before deleting bounded batches. It
removes completed ingestion runs, old audit events, expired/revoked sessions,
and content that has no source occurrence, action, or media. Favorited content
and any cached media are therefore ineligible. BullMQ has age and count bounds;
cache quota/TTL eviction and orphan-byte cleanup remain separately bounded.

In a disposable environment, `scripts/failure-injection.sh` restarts the worker
and Redis and verifies the source identity uniqueness invariant. Provider
timeouts are covered by the bounded connector/ingestion integration tests. Run
this after a representative import and inspect failed/delayed queue counts.

## Reverse proxy

Bind the application only behind the proxy. The proxy must overwrite
`X-Forwarded-For` and `X-MirthSpool-Forwarded-By`; the latter is the proxy's own
exact IP listed in `MIRTHSPOOL_TRUSTED_PROXY_IPS`. Requests without a matching
proxy identity are rate-limited as direct traffic. Preserve the original Host
and HTTPS scheme, reject oversized bodies, and do not expose metrics directly.

## Incident runbooks

- Credential rotation: pause the affected source, take/verify a backup, replace
  the credential through the source API, validate, resume, and audit the run.
- Encryption-key rotation: pause all sources, stop web/worker, take a verified
  backup plus separate old-key escrow, re-encrypt every credential in one
  controlled operation, advance the key version, test decryptability, restart.
- Session invalidation: rotate `MIRTHSPOOL_AUTH_SECRET` for every session, or
  revoke targeted database sessions, then restart web and verify sign-in.
- Pause all sources: stop worker for immediate containment, set sources disabled
  through reviewed administration, drain active jobs, and preserve failed jobs.
- Cache purge: use the protected purge endpoint or maintenance queue, verify
  metrics reach zero, and never delete the named volume directly.
- Recovery: isolate the target, preserve failed artifacts/logs, restore only from
  a verified backup with its separately held key, reconcile cache, run integrity
  checks, then reopen network access.
