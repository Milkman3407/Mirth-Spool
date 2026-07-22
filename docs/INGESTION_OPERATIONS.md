# Ingestion operations

PostgreSQL is the durable authority for source health, checkpoints, and run history. Redis and BullMQ are delivery infrastructure and may be rebuilt; enabled sources whose `nextPollAt` is due are enqueued again by the scheduler.

Only one `RUNNING` ingestion row is permitted per source. A worker that finds a stale row marks it `CANCELLED` before claiming a replacement. Provider work is bounded to 60 seconds, 10 pages, 100 items, 12 requests, and 10 MB by default. Shutdown aborts active provider requests before workers close, so interrupted jobs are not acknowledged as successful.

Transient and rate-limited failures use bounded exponential retry with deterministic jitter. A provider `Retry-After` value takes precedence. Authentication, configuration, not-found, malformed, and permanent failures do not automatically retry. Queue payloads contain only a source ID, trigger, and requested timestamp.

`MIRTHSPOOL_INGESTION_RUN_RETENTION_DAYS` controls completed database run retention. `MIRTHSPOOL_COMPLETED_JOB_RETENTION_SECONDS` and `MIRTHSPOOL_FAILED_JOB_RETENTION_SECONDS` control BullMQ retention. The maintenance queue removes expired database runs; BullMQ applies bounded age/count cleanup when jobs finish.

The M06 migration adds `jobId`, `attempt`, and a partial unique index for running source jobs. Rollback requires worker downtime: drop `ingestion_runs_one_running_per_source_idx`, `IngestionRun_jobId_idx`, then the two columns. Rolling back the uniqueness index while workers run can allow overlapping polls.
