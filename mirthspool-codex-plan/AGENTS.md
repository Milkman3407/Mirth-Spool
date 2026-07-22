# AGENTS.md — Instructions for Codex

## Mission

Build MirthSpool as a secure, maintainable, self-hosted content aggregator. Implement one milestone at a time and preserve the product boundary described in the governing documents.

## Instruction priority

When requirements appear to conflict, use this order:

1. Security and privacy requirements.
2. Content and source policy.
3. Product requirements.
4. Architecture, data model, and API contracts.
5. The active milestone.
6. Existing implementation details.

Do not weaken a higher-priority requirement to make a milestone easier. Document any genuine conflict instead of guessing.

## Mandatory working method

Before making changes:

1. Read this file.
2. Read the active milestone in full.
3. Read every governing document referenced by that milestone.
4. Inspect the existing repository, migrations, tests, and current branch.
5. State the implementation plan in the task log or pull-request description.

While making changes:

- Work only on the active milestone.
- Prefer small, reviewable commits.
- Reuse existing conventions unless they violate the governing documents.
- Keep secrets out of source control, logs, client bundles, error responses, fixtures, and snapshots.
- Do not add broad dependencies when a small, maintained library or platform primitive is sufficient.
- Do not silently change public API contracts.
- Do not introduce manual meme-upload functionality.
- Do not scrape unsupported HTML pages when a documented API or feed is unavailable.
- Do not make external network calls in unit tests.
- Use deterministic fixtures for connector tests.
- Do not delete or rewrite applied migrations.
- Do not begin the next milestone.

Before declaring completion:

1. Run all quality gates applicable to the milestone.
2. Review the diff for accidental secrets, generated artifacts, and unrelated edits.
3. Verify new environment variables are documented in `.env.example`.
4. Verify new behavior has tests.
5. Verify database changes have forward migrations and rollback notes.
6. Provide the completion report described below.

## Repository conventions

Use this target layout unless an accepted milestone changes it:

```text
apps/
  web/
  worker/
packages/
  config/
  connectors/
  db/
  shared/
  ui/
docs/
milestones/
tests/
  fixtures/
  integration/
  e2e/
```

Use TypeScript in strict mode. Avoid `any`; when unavoidable at an external boundary, isolate it and validate immediately with Zod.

Prefer:

- Named exports for shared modules.
- Dependency injection at network, clock, queue, storage, and hashing boundaries.
- Structured errors with stable codes.
- UTC timestamps in storage and APIs.
- Cursor pagination rather than offset pagination.
- Idempotent writes and jobs.
- Database uniqueness constraints in addition to application checks.
- Explicit transactions for multi-record state changes.
- Accessible semantic HTML before custom interaction code.

## Expected commands

The repository should converge on the following commands. A milestone may introduce them incrementally, but it must not create conflicting alternatives without updating this file.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
docker compose config
```

A milestone that does not yet support a command must say so in its completion report. Do not report a command as passing unless it was actually run.

## Testing rules

- Unit tests must be fast and network-free.
- Connector tests must use checked-in sanitized fixtures and mocked HTTP.
- Integration tests may use ephemeral PostgreSQL and Redis containers.
- End-to-end tests must create and clean their own data.
- Every defect fixed after M07 should receive a regression test.
- Time-dependent behavior must use an injected or fake clock.
- Random feed behavior must accept a deterministic seed in tests.

See [TEST_STRATEGY.md](TEST_STRATEGY.md).

## Security rules

- Validate every untrusted input at the boundary.
- Authenticate all application APIs except explicitly public health endpoints and first-run setup while no user exists.
- Authorize administrative operations server-side.
- Use secure, HTTP-only, same-site cookies in production.
- Protect state-changing browser requests against CSRF.
- Rate-limit authentication, setup, refresh, and proxy endpoints.
- Apply SSRF defenses to source and media fetching.
- Enforce response-size, media-size, redirect, timeout, and content-type limits.
- Never turn MirthSpool into an open redirect or open proxy.
- Redact credentials, authorization headers, tokens, cookies, and encryption keys from logs.

See [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md).

## Database rules

- Use Prisma migrations checked into source control.
- Model external identifiers as strings; never assume numeric range or format.
- Add uniqueness constraints for idempotency.
- Use soft-removal/status fields for imported content when deletion history matters.
- Store raw provider payloads only when necessary, bounded, and scrubbed of secrets.
- Include migration notes for indexes, locks, backfills, and large-table behavior.

See [DATA_MODEL.md](DATA_MODEL.md).

## Completion report

At the end of every milestone, provide:

```markdown
## Milestone completion report

### Implemented
- ...

### Key files changed
- ...

### Database or configuration changes
- ...

### Commands run
- `command` — PASS/FAIL/NOT AVAILABLE

### Tests added
- ...

### Security and privacy review
- ...

### Known limitations
- ...

### Acceptance criteria
- [x] ...
- [ ] ... — explanation

### Recommended next action
Stop here and review/merge this milestone. Do not begin the next milestone.
```

If any acceptance criterion is incomplete, say so plainly. Never mark partial work complete.
