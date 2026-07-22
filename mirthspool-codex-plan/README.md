# MirthSpool Codex Build Pack

MirthSpool is a self-hosted meme aggregator that automatically gathers images, GIFs, and short videos from administrator-approved Reddit, Lemmy, Mastodon, and RSS/Atom sources. It presents a personalized infinite feed with favorites, hides, filters, duplicate detection, and optional local caching. Manual uploads are not part of the MVP.

This folder is a build specification intended to be placed at the root of a new Git repository and handed to Codex one milestone at a time.

## Product boundary

The first release is a private, single-administrator service. It is an aggregator and feed reader, not a public content host or a replacement social network.

The MVP must:

- Run through Docker Compose on a typical Linux host.
- Provide a responsive web interface and installable PWA.
- Ingest only from sources explicitly configured by the administrator.
- Use official APIs, public feeds, and documented protocols rather than brittle HTML scraping.
- Store post metadata by default and load media from the original source.
- Offer optional bounded media caching.
- Preserve attribution and a link to the original post.
- Support favorites, hides, viewed state, search, filters, and basic duplicate detection.
- Keep all credentials and administrative controls server-side.

The MVP must not:

- Require users to upload memes.
- Offer public registration.
- expose an unauthenticated media proxy.
- Implement opaque AI recommendations, OCR, face recognition, or content generation.
- Mirror entire communities indefinitely without an explicit cache policy.
- Bypass source access controls, rate limits, or platform terms.

## Chosen implementation

The reference architecture uses:

- A `pnpm` TypeScript monorepo.
- Next.js with the App Router for the web application and HTTP API.
- A separate Node.js worker for scheduled ingestion.
- PostgreSQL for durable state.
- Redis and BullMQ for queues, scheduling, locks, and short-lived caches.
- Prisma for schema management and database access.
- Zod for runtime validation.
- Vitest for unit and integration tests.
- Playwright for end-to-end tests.
- Docker Compose for local development and self-hosted deployment.
- A storage adapter that initially supports local disk and can later support S3-compatible storage.

Use current stable, mutually compatible versions when implementation begins. Pin versions in the lockfile and container images after the first successful build.

## How to use this pack with Codex

1. Copy all Markdown files into the repository, preserving the `milestones/` directory.
2. Give Codex `AGENTS.md`, the governing design documents, and exactly one active milestone.
3. Ask Codex to inspect the repository before editing and to implement only the active milestone.
4. Require the quality gates in `AGENTS.md` before accepting a milestone.
5. Review the diff, migration plan, tests, and completion report.
6. Merge the milestone before starting the next one.

Each milestone is designed to be one focused pull request. Codex must stop after satisfying that milestone's acceptance criteria.

## Governing documents

- [AGENTS.md](AGENTS.md) — repository-wide instructions for Codex.
- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) — user-facing behavior and scope.
- [ARCHITECTURE.md](ARCHITECTURE.md) — system boundaries and deployment model.
- [DATA_MODEL.md](DATA_MODEL.md) — persistent domain model.
- [API_CONTRACT.md](API_CONTRACT.md) — HTTP and connector contracts.
- [CONTENT_AND_SOURCE_POLICY.md](CONTENT_AND_SOURCE_POLICY.md) — source, attribution, and media rules.
- [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) — threat model and required controls.
- [TEST_STRATEGY.md](TEST_STRATEGY.md) — test layers and quality gates.
- [DELIVERY_WORKFLOW.md](DELIVERY_WORKFLOW.md) — branch, PR, migration, and handoff process.
- [MILESTONES.md](MILESTONES.md) — ordered roadmap.

## Definition of the v0.1 release

MirthSpool v0.1 is complete when milestones M00 through M17 are merged and a clean Linux host can:

1. Clone the repository.
2. Copy `.env.example` to `.env`.
3. Run `docker compose up -d`.
4. Complete first-run administrator setup.
5. Add at least one supported source.
6. Observe successful ingestion.
7. Browse an infinite feed.
8. Favorite, hide, search, and filter content.
9. Enable an optional bounded media-cache policy.
10. Back up and restore the database using documented commands.
11. Upgrade using a documented, migration-safe procedure.

M18 and M19 are optional post-MVP expansion milestones.
