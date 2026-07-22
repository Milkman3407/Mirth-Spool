# M16 restore and failure-injection evidence

Date: 2026-07-22 UTC

This evidence used synthetic records and contains no credentials, private source names, or secret values.

## Environment

- Ubuntu 24.04 VM
- Docker Engine 29.1.3
- Node.js 24.18.0
- pnpm 11.9.0
- PostgreSQL 17.6
- PostgreSQL image: `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c777535442eee94`
- Redis image: `sha256:987c376c727652f99625c7d205a1cba3cb2c53b92b0b62aade2bd48ee1593232`
- Web image: `sha256:0be6a010636256028139f7539811a01be4f0c118b0c743fcb812222ca3dc43d85`
- Worker image: `sha256:0ba07186327b3f345369036e802385f058b89d53546b533dd6f71ca158f463f67`

## Backup and clean restore

The guarded recovery fixture and non-zero synthetic user/favorite records were backed up from the disposable `m16restore` Compose project as `mirthspool-20260722T192320Z`. The backup verifier confirmed the database dump, media archive, PostgreSQL version, Compose service list, and external-key notice. The source project and its volumes were removed before restoration into a new `m16verify` Compose project.

Post-restore integrity counts:

- users: 1
- sources: 3
- feed content items: 1
- user actions: 1
- missing cache objects after reconciliation: 0

The encrypted synthetic source credential decrypted successfully when the original external `APP_ENCRYPTION_KEY` was supplied. A deliberately different key produced the expected controlled credential-envelope failure. The key was not included in the database backup.

## Failure injection

The disposable restored stack passed the bounded failure drill:

- worker process restart recovered to healthy;
- Redis restart recovered to healthy;
- the database uniqueness check found no duplicate `(sourceId, externalId)` source identities;
- provider-timeout recovery and ingestion idempotency are covered by the integration suite.

## Security scans

The pinned Trivy 0.69.3 image scanned the rebuilt production images with unfixed findings ignored and severity restricted to `HIGH,CRITICAL`. Both the Alpine packages and application dependencies reported zero findings for:

- `mirthspool-web:local`
- `mirthspool-worker:local`
