# MirthSpool

MirthSpool is a private, self-hosted content aggregator for administrator-selected meme-oriented sources. The project is being built milestone by milestone from the checked-in [Codex build pack](mirthspool-codex-plan/README.md).

The repository includes the local runtime, PostgreSQL domain model, private
authentication, official RSS, Lemmy, Mastodon-compatible, and approved Reddit
Data API ingestion,
ranked browsing, private user libraries, and an optional bounded media cache
through M13. Manual content-upload
functionality is intentionally not present. Reddit sources require an
operator-registered and approved OAuth client; see the
[connector security boundary](docs/CONNECTORS.md) before enabling one.

## Prerequisites

- Node.js 24
- pnpm 11.9.0, activated through Corepack from the `packageManager` pin
- Docker Engine with Docker Compose v2

## Setup and quality checks

Create a local `.env` and replace the database-password placeholder before starting the runtime. Full commands, reset warnings, log usage, and reverse-proxy expectations are in [Local runtime operations](docs/LOCAL_RUNTIME.md).

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
pnpm test:integration
```

## Selecting and executing the next milestone

After the active milestone is reviewed and merged, select the next incomplete milestone from the [milestone index](mirthspool-codex-plan/MILESTONES.md). Read `AGENTS.md`, the selected milestone, and every governing document it references before editing. Use one branch and one pull request for that milestone, run all applicable gates, provide the required completion report, and stop without beginning a later milestone.

See [Database and domain model](docs/DATABASE.md) for migration, rollback, and
seed operations. See [CONTRIBUTING.md](CONTRIBUTING.md) for repository
conventions, [authentication operations](docs/AUTHENTICATION.md), and the
[connector security boundary](docs/CONNECTORS.md). The authenticated browsing
behavior and remote-media privacy boundary are documented in the
[web feed experience](docs/WEB_FEED_EXPERIENCE.md).
Favorite, hide, view-history, Unseen, and private-library behavior are documented
in [user actions and library operations](docs/USER_ACTIONS_AND_LIBRARY.md).
The default remote-only mode, cache policies, quotas, private-network controls,
delivery route, eviction, and purge operations are documented in
[media cache operations](docs/MEDIA_CACHE.md).
