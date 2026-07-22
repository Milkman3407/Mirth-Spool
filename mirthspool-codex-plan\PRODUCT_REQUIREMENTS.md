# Product Requirements

## 1. Product summary

MirthSpool is a private, self-hosted application that collects meme-oriented media from administrator-selected internet sources and presents it as a clean, continuously scrollable feed. It is designed for users who want an iFunny-like browsing experience without depending on a single centralized feed and without manually uploading content.

## 2. Primary user

The MVP has one local administrator who is also the feed user. The administrator can configure sources, control content policy, view source health, and use the feed.

Post-MVP may add invitation-only members, but public registration is not a v0.1 requirement.

## 3. Core jobs to be done

The user must be able to:

1. Deploy MirthSpool on a Linux server with Docker Compose.
2. Complete a secure first-run setup.
3. Add, validate, pause, refresh, edit, and remove supported sources.
4. See when each source last succeeded or failed.
5. Browse a mixed feed of images, animated images, and short videos.
6. Switch between newest, hot, random, and saved views.
7. Favorite content, hide content, and avoid repeatedly seeing already-viewed items when desired.
8. Search titles, authors, communities, source names, and tags.
9. Filter by source, media type, age, content rating, and favorite state.
10. Open the original post with attribution.
11. Choose whether media remains remote or is cached under a bounded policy.
12. Back up, restore, upgrade, and troubleshoot the service.

## 4. Functional requirements

### PR-F001 — First-run setup

When no user exists, `/setup` must allow creation of the first administrator. After an administrator exists, setup must be closed and public registration must remain unavailable.

### PR-F002 — Authentication

Administrative pages, feeds, libraries, settings, source configuration, and non-health APIs must require an authenticated session. Sessions must be revocable.

### PR-F003 — Source management

The administrator must be able to manage these source kinds:

- RSS/Atom feed URL.
- Lemmy instance and community.
- Mastodon instance plus hashtag or public account timeline.
- Reddit subreddit through official API credentials.

Each source has a display name, enabled state, poll interval, priority, content-rating policy, minimum score where supported, and connector-specific configuration.

### PR-F004 — Source validation

Before a source is enabled, MirthSpool must validate its configuration and perform a bounded connectivity check. A failed check must return a useful, sanitized error.

### PR-F005 — Scheduled ingestion

Enabled sources must be polled on schedule. Polling must be idempotent, rate-aware, retryable, and protected from overlapping runs.

### PR-F006 — Manual refresh

The administrator may request a refresh. Refresh requests must be rate-limited and enqueue work rather than keeping a browser request open for an entire ingestion run.

### PR-F007 — Normalized content

Provider-specific posts must be normalized into a stable internal representation containing source identity, external ID, title, author, community, original URL, publication time, score when available, content warning, content rating, and media assets.

### PR-F008 — Supported media

The MVP supports:

- Static images.
- Animated GIFs or GIF-like video.
- Short video with a usable remote or cached URL.
- Link-only fallback cards when media extraction is not possible.

Unsupported or dangerous media must not be rendered inline.

### PR-F009 — Feed modes

The user can browse:

- `new` — reverse chronological.
- `hot` — transparent age-decayed ranking.
- `random` — deterministic random order for a supplied seed.
- `favorites` — saved items.
- `unseen` — items without a view event, when enabled.

All feeds use cursor pagination.

### PR-F010 — User actions

Favorite, unfavorite, hide, unhide, and view operations must be idempotent. Hidden content is excluded by default. A user can inspect and restore hidden items from a management view.

### PR-F011 — Duplicate handling

Exact source duplicates must never create duplicate records. The product should group or suppress cross-source duplicates using canonical URLs, cryptographic hashes where available, and perceptual image hashes where safely obtainable.

### PR-F012 — Search and filters

Search must cover title, author, community, source display name, and tags. Filters must be composable and encoded in the URL so views are bookmarkable.

### PR-F013 — Content rating

Sources and posts may be marked safe, sensitive, or adult. Sensitive/adult content is disabled or blurred by default until the administrator explicitly changes settings. Original provider content warnings must be preserved.

### PR-F014 — Attribution

Every feed item must identify its source and provide an obvious link to the original post. Cached media must not remove attribution.

### PR-F015 — Media caching

Remote-only mode is the default. Optional policies include favorites-only, bounded time-to-live, and all-within-quota. The application must expose quota use and eviction behavior.

### PR-F016 — Source health

The administrator can see last attempt, last success, next scheduled run, consecutive failures, last error code, and recent ingestion statistics for each source.

### PR-F017 — PWA

The web application must be installable, responsive, keyboard-accessible, and usable on common phone and desktop viewport sizes.

### PR-F018 — Operations

The service must include health endpoints, structured logs, backup/restore commands, migration-safe upgrades, and documented recovery procedures.

## 5. Non-functional requirements

### Reliability

- Re-running an ingestion job must not duplicate content.
- A failing source must not block other sources.
- Restarting the worker must not corrupt job state.
- Database transactions must protect multi-row changes.

### Performance

Initial targets for a modest self-hosted instance:

- Feed API p95 under 500 ms for 100,000 content items on recommended hardware.
- First feed page rendered without downloading off-screen full-size media.
- Source-management API p95 under 300 ms excluding explicit connectivity tests.
- Background ingestion concurrency and remote request limits must be configurable.

These are engineering targets, not hard service guarantees.

### Resource bounds

All remote fetches, job payloads, stored raw payloads, media downloads, retries, retention, and caches must have explicit limits.

### Accessibility

Interactive feed controls must have accessible names, visible focus states, keyboard operation, and no dependence on color alone. Respect reduced-motion preferences.

### Privacy

MirthSpool should not add third-party analytics, advertising, or tracking pixels. Remote media loading may reveal the server or browser IP to the source; this behavior must be documented, and proxy/cache modes must be explicit.

### Maintainability

Connector-specific code must be isolated behind a common interface. Core feed and user-action logic must not depend directly on provider payload shapes.

## 6. UX principles

- The feed is the home screen after login.
- Source attribution is visible but secondary to the media.
- Administrative complexity stays out of the browsing flow.
- Failure states explain what the user can do next.
- Controls are usable one-handed on mobile.
- Videos are muted by default and never autoplay with sound.
- Content warnings are respected.
- No upload button appears in the MVP.

## 7. MVP success criteria

The MVP is successful when a fresh instance can run for seven days with at least one source of every implemented connector kind, without duplicate storms, unbounded storage growth, stuck jobs, leaked credentials, or manual database intervention.

## 8. Explicitly deferred

- Public accounts and public registration.
- User-uploaded media.
- Comments and direct messaging.
- Federation as a server.
- AI-generated recommendations.
- OCR and semantic image search.
- Native iOS or Android applications.
- Browser extensions.
- Automated reposting to other platforms.
