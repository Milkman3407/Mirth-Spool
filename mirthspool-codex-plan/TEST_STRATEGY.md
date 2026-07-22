# Test Strategy

## 1. Goals

Tests must make connector behavior deterministic, protect ingestion idempotency, catch security regressions at network boundaries, and verify the main user journey on a clean deployment.

## 2. Test layers

### Static checks

- Formatting.
- ESLint.
- TypeScript strict type checking.
- Prisma schema validation.
- Docker Compose configuration validation.
- Secret scanning.
- Dependency and container scanning in CI.

### Unit tests

Use Vitest. Unit tests must not use the real network, PostgreSQL, Redis, system clock, or filesystem unless the test is specifically for a filesystem adapter and uses a temporary directory.

Cover:

- Zod schemas.
- Cursor encoding/decoding.
- Ranking.
- Normalization.
- Content-rating mapping.
- URL and SSRF policy.
- Retry classification.
- Cache-policy decisions.
- Duplicate-distance thresholds.
- Authorization helpers.

### Connector fixture tests

Each connector must include sanitized fixtures representing:

- Successful page.
- Empty page.
- Multiple media types.
- Missing optional fields.
- Sensitive/adult marker.
- Deleted/removed post.
- Pagination/checkpoint.
- Rate limit response.
- Authentication error where applicable.
- Malformed provider payload.
- Duplicate external ID.

Mock HTTP at the hardened-client boundary. Do not rely on live provider data in CI.

### Integration tests

Run against ephemeral PostgreSQL and Redis.

Cover:

- Migrations on an empty database.
- Repository uniqueness and transactions.
- First-run setup race.
- Session persistence and revocation.
- Queue idempotency and retry.
- Checkpoint advancement.
- Source failure isolation.
- Feed cursor pagination.
- User-action idempotency.
- Search indexes.
- Cache metadata lifecycle.
- Backup/restore smoke path when feasible.

### End-to-end tests

Use Playwright against the containerized application.

Required v0.1 journeys:

1. Complete first-run setup.
2. Log out and log in.
3. Add an RSS fixture source through a local test server.
4. Trigger refresh and observe source success.
5. Browse the feed and load another page.
6. Favorite, hide, and unhide an item.
7. Search and filter.
8. Change content-rating settings and verify blur/exclusion.
9. Enable a cache policy and verify a cached asset.
10. Verify responsive behavior at desktop and phone viewport sizes.
11. Verify keyboard navigation and focus visibility.
12. Verify an unauthenticated request cannot access feed/admin/cached media.

### Security tests

Automate regression cases for:

- SSRF to loopback, private, link-local, IPv6 local, and metadata-style addresses.
- Redirect from public to private IP.
- Oversized and slow responses.
- Unsupported MIME and disguised HTML/SVG.
- Path traversal storage keys.
- Open-proxy attempts.
- CSRF rejection.
- Brute-force rate limit.
- Cursor tampering.
- XSS payloads in titles, authors, content warnings, and feed HTML.
- Secret redaction from logs and API errors.

## 3. Test data

- Keep fixtures small, sanitized, and clearly licensed or synthetic.
- Do not commit real access tokens, cookies, user identifiers, or private posts.
- Use stable timestamps and IDs.
- Store expected normalized output alongside complex fixtures where helpful.
- Generate large performance datasets rather than committing them.

## 4. Determinism

Inject:

- Clock.
- Random seed.
- HTTP client.
- Queue client where practical.
- Storage adapter.
- Hashing/perceptual-hash implementation boundary.

Random feed tests must specify a seed and assert stable pagination without duplicates.

## 5. Performance tests

By M14, include a repeatable script that loads representative data, such as:

- 100,000 content items.
- 150,000 source posts.
- 120,000 media assets.
- 25,000 user actions.
- 1,000 tags.

Measure feed and search queries with warm and cold cache assumptions. Store results as build artifacts or documented output; do not make fragile microbenchmarks gate every commit.

## 6. Quality gates by milestone

Every milestone:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

When applicable:

```bash
pnpm test:integration
pnpm test:e2e
```

Connector milestones require fixture tests. Database/API milestones require integration tests. User-flow milestones require Playwright coverage.

## 7. CI matrix

Recommended jobs:

1. Static checks and unit tests.
2. Integration tests with PostgreSQL and Redis services.
3. Production build.
4. Docker image build.
5. Playwright end-to-end test against Compose.
6. Dependency/secret/container scans.
7. Release-only SBOM and image signing/provenance where supported.

## 8. Flaky-test policy

Do not paper over flakiness with broad retries.

- Identify race, time, network, or cleanup cause.
- Use deterministic waits on observable state, not arbitrary sleeps.
- Ensure each test owns its data.
- Allow a narrow CI retry only while an issue is tracked, with an expiration/removal plan.

## 9. Definition of tested

A feature is not tested merely because a component renders. Tests must assert meaningful behavior, authorization, persistence, error handling, and at least one boundary case.
