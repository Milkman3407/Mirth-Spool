# M02 — Database and Domain Model

**Depends on:** M01  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Implement the durable PostgreSQL domain model, Prisma migrations, repository boundaries, and deterministic seed/test data needed by future ingestion and feed milestones.

## Required deliverables

- Prisma schema covering the v0.1 core entities.
- An initial checked-in migration.
- Database client lifecycle suitable for web, worker, tests, and hot reload.
- Repository/services for sources, content occurrences, media metadata, user actions, settings, and ingestion runs.
- Seed data that is synthetic and safe.
- Integration-test infrastructure using an isolated database.

## Implementation tasks

- Translate `DATA_MODEL.md` into Prisma models and enums, retaining required uniqueness constraints.
- Model `ContentItem` separately from `SourcePost` so cross-source duplicates can later share a canonical item.
- Add source health fields, checkpoints, ingestion runs, media cache metadata, tags, user actions, settings, and audit events.
- Use authentication-library-compatible user/session fields without implementing login yet.
- Create repository functions that accept an explicit Prisma client or transaction.
- Implement an idempotent upsert boundary for normalized source posts using `(sourceId, externalId)`.
- Implement transactional creation of a content item, source occurrence, and media rows.
- Add a typed settings service with validated defaults.
- Add a bounded raw-payload storage policy or leave raw payload disabled by default.
- Create synthetic seed content sufficient to render/test later feed work.
- Document schema decisions that intentionally differ from suggested names.

## Required behavior and contracts

- External IDs are opaque strings.
- All timestamps are stored in UTC.
- Uniqueness constraints, not only application checks, enforce ingestion idempotency.
- Secrets must not be stored in `Source.configJson`.
- Deletion/cascade behavior must preserve attribution unless an explicit purge occurs.
- Redis must not become the source of truth.
- Repository methods must support transactions and deterministic tests.

## Test requirements

- Apply migrations to an empty PostgreSQL database.
- Apply migrations from the previous milestone state.
- Integration-test duplicate source-post upserts under sequential and concurrent attempts.
- Integration-test transaction rollback when media persistence fails.
- Test settings validation and defaults.
- Test cascade/soft-deletion behavior for source, content, media, actions, and sessions.
- Run Prisma validation and generated-client build.

## Acceptance criteria

- [ ] The initial migration is checked in and reproducible.
- [ ] All required core entities and indexes are present.
- [ ] Concurrent duplicate insertion does not create duplicate source posts.
- [ ] Content/source/media creation is transactional.
- [ ] Synthetic seed data contains no copyrighted real meme media or private data.
- [ ] Repository boundaries are used instead of scattering ORM calls through UI code.
- [ ] Migration and rollback notes are included.

## Out of scope

- First-run admin creation.
- Credential encryption implementation.
- Live connectors.
- Feed API/UI.
- Full-text indexes or perceptual hashes beyond schema placeholders.

## Governing documents to read

- [DATA_MODEL.md](../DATA_MODEL.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)

## Implementation notes

The schema should support future milestones without over-generalizing. Prefer explicit columns for frequently queried fields and validated JSON only for connector-specific configuration or bounded provider flags.

## Codex handoff prompt

```text
Implement only M02 — Database and Domain Model.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
