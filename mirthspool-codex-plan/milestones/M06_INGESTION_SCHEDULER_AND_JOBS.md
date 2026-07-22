# M06 — Ingestion Scheduler and Jobs

**Depends on:** M05  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Connect source scheduling, BullMQ, connector execution, transactional persistence, checkpoints, retries, and source health into a reliable ingestion pipeline. RSS/Atom becomes fully usable at the end of this milestone.

## Required deliverables

- BullMQ queues and worker processors.
- A due-source scheduler with overlap prevention.
- Manual refresh enqueueing.
- Transactional normalization persistence and checkpoint advancement.
- Classified retries, backoff, cancellation, and dead-letter/failed-job visibility.
- Source run history and health UI.
- Maintenance cleanup for old run records and completed queue jobs.

## Implementation tasks

- Create named queues for source polling, media work placeholders, duplicate work placeholders, and maintenance.
- Implement a scheduler that queries enabled sources due by `nextPollAt` and enqueues deterministic job IDs.
- Use a database lease/run record so multiple schedulers or workers cannot poll the same source concurrently.
- Create an `IngestionRun` before provider work and finalize it on every outcome.
- Invoke connectors with strict run limits: duration, pages, items, requests, and bytes.
- Normalize/validate connector output again at the worker boundary.
- Upsert source posts and canonical content transactionally and idempotently.
- Advance checkpoints only after corresponding writes commit.
- Update source health fields and calculate the next poll time.
- Implement retry classes: transient and rate-limited retry; auth/config/permanent errors stop automatic retry and mark source status.
- Use exponential backoff with jitter and provider `Retry-After`/reset metadata where valid.
- Implement authenticated `POST /api/sources/:id/refresh` returning `202` and a run/job reference.
- Rate-limit manual refresh and coalesce duplicate requests.
- Build recent-run details into the source-health UI.
- Implement graceful worker shutdown so active jobs are not falsely acknowledged.
- Add configurable retention for ingestion runs and completed/failed queue records.

## Required behavior and contracts

- A failing source cannot block another source.
- At most one active poll run per source is allowed.
- Repeated or retried jobs must not duplicate source posts.
- Checkpoints never move ahead of durable content.
- Manual refresh never performs provider work in the web request.
- Job payloads contain IDs and bounded metadata, not plaintext credentials.
- Failures shown to the client are sanitized but retain stable diagnostic codes.
- Queue state is reconstructable; durable source health is in PostgreSQL.

## Test requirements

- Integration-test scheduled due-source selection and next-poll calculation.
- Integration-test duplicate scheduler instances and overlapping manual/scheduled refresh.
- Integration-test worker restart/retry after persistence succeeds but job acknowledgement does not.
- Integration-test transaction failure before checkpoint update.
- Test each connector error class and resulting source status/retry behavior.
- Test rate-limit delay handling.
- Test run limits for pages/items/duration.
- Playwright-test manual refresh, run progress/result, and a failed source state using local fixture endpoints.

## Acceptance criteria

- [ ] Enabled RSS/Atom sources poll automatically.
- [ ] Manual refresh returns quickly and executes asynchronously.
- [ ] At most one run per source is active.
- [ ] Ingestion is idempotent under retries and concurrent delivery.
- [ ] Checkpoints are transactionally safe.
- [ ] Source health and recent run statistics are visible.
- [ ] Retries and permanent failure states match error classification.
- [ ] Worker shutdown and retention behavior are documented and tested.

## Out of scope

- Lemmy, Mastodon, or Reddit connectors.
- Feed ranking/API.
- Media cache downloads.
- Cross-source perceptual duplicate analysis.
- Distributed scheduler tuning beyond correctness.

## Governing documents to read

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)

## Implementation notes

Use database constraints as the final idempotency layer. Queue deduplication and leases improve efficiency but must not be the only correctness mechanism. Avoid long database transactions around remote requests.

## Codex handoff prompt

```text
Implement only M06 — Ingestion Scheduler and Jobs.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
