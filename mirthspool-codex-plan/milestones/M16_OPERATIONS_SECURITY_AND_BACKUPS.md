# M16 — Operations, Security, and Backups

**Depends on:** M15  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Prepare MirthSpool for sustained self-hosting by completing observability, retention, backup/restore, security hardening, diagnostics, and deployment safeguards. Validate recovery instead of merely documenting commands.

## Required deliverables

- Production health/readiness semantics for each process.
- Structured logs, metrics, and protected diagnostics.
- Database and cached-media backup/restore tooling and runbook.
- Retention/maintenance jobs.
- Container/runtime hardening.
- Security headers, rate limits, and redaction audit.
- Dependency, secret, and container scanning.
- Failure-injection and restore evidence.

## Implementation tasks

- Review and finalize liveness/readiness behavior for web and worker roles.
- Add structured metrics for HTTP latency/status, queue depth, job duration/outcome, provider requests, imported/duplicate counts, source failures, cache bytes/evictions, and database pool health.
- Expose metrics through an authenticated endpoint or separately configured metrics secret/network.
- Add correlation/request IDs across web enqueue, queue job, connector request, and ingestion run.
- Implement a sanitized diagnostics bundle or command that excludes secrets and private payloads.
- Create PostgreSQL backup and restore scripts using supported native tools, version checks, compression, and failure handling.
- Document backup scope for database, configuration, encrypted credentials, encryption key, and cache bytes.
- Keep encryption keys outside the database backup and explain that both are required for credential recovery.
- Implement/cache metadata reconciliation after restore.
- Test restore into a clean environment and run integrity checks.
- Finalize retention jobs for ingestion runs, audit events, orphaned source posts/content, stale sessions, queue records, and cache objects.
- Add maintenance dry-run/report behavior before destructive cleanup where practical.
- Apply production security headers and review CSP against remote-media/cache strategy.
- Review rate limits for authentication, setup, source validation, refresh, search, and media.
- Run a secret/log redaction audit with synthetic canary secrets.
- Harden Compose/container settings: non-root, read-only root where practical, dropped capabilities, no Docker socket, bounded resources, explicit writable volumes, graceful stop.
- Pin base images through controlled versions/digests and add vulnerability/secret/dependency scans.
- Document reverse-proxy trusted-header configuration so client IP/rate limiting cannot be spoofed.
- Create incident runbooks for credential rotation, session invalidation, pause-all-sources, purge, and recovery.

## Required behavior and contracts

- Readiness failures do not leak topology or credentials.
- Metrics labels avoid unbounded cardinality and do not contain raw URLs/user data.
- Backups are not considered valid until a restore test succeeds.
- Database backups containing encrypted credentials are still sensitive.
- Retention never deletes favorited content/cache contrary to configured policy.
- Diagnostics are sanitized by construction, not a manual promise.
- Client IP is trusted only from explicitly configured reverse proxies.
- Production must fail fast on default/weak secrets.

## Test requirements

- Integration-test metrics counters around successful/failed/retried ingestion.
- Test redaction with canary password/token/cookie/query values across logs and errors.
- Test readiness during PostgreSQL, Redis, and storage failure.
- Run backup and restore into a fresh Compose project; verify users, sources, feed, actions, and credential decryptability with the external key.
- Test restore behavior without the encryption key and document controlled failure.
- Test retention dry run and execution against protected/favorited data.
- Run SSRF, CSRF, XSS, open-proxy, and media-security regression suites.
- Run dependency, secret, and container scans.
- Failure-inject worker termination, Redis restart, and provider timeout; verify recovery/idempotency.

## Acceptance criteria

- [ ] Operational metrics and sanitized logs cover major request/job paths.
- [ ] Metrics/diagnostics are protected and bounded.
- [ ] Backup and restore scripts are documented and a clean restore has been demonstrated.
- [ ] Encryption-key backup responsibilities are explicit.
- [ ] Retention and orphan cleanup are safe and tested.
- [ ] Security headers, rate limits, trusted-proxy behavior, and redaction are finalized.
- [ ] Containers run without unnecessary privileges.
- [ ] Security/dependency/container scans run in CI.
- [ ] Failure-injection tests show no duplicate storm or data corruption.
- [ ] Incident/recovery runbooks exist.

## Out of scope

- Managed cloud deployment templates.
- Kubernetes.
- High-availability PostgreSQL/Redis.
- External SIEM integration.
- Automated off-site backup provider configuration.
- Formal penetration-test certification.

## Governing documents to read

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)

## Implementation notes

A backup script without a tested restore is incomplete. Capture the exact software/container versions used during the restore test, but avoid putting actual secret values or private source names in evidence.

## Codex handoff prompt

```text
Implement only M16 — Operations, Security, and Backups.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
