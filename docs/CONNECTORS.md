# Connector SDK and source-management boundary

M04 defines the provider-independent boundary. M05 adds public RSS 2.0 and Atom
feeds. M10 adds public Lemmy communities through the documented instance API.
Mastodon and Reddit remain unavailable until their own reviewed milestones.

## Connector contract

`@mirthspool/connectors` exports strict Zod schemas for normalized posts, media,
pages, checkpoints, rate-limit metadata, and connectivity results. A connector
is registered by `SourceKind` and receives only:

- the shared hardened HTTP client;
- validated non-secret configuration;
- decrypted credentials scoped to the call;
- an injected clock and abort signal;
- a structured logger; and
- explicit request, byte, item, and page limits.

Provider modules must not instantiate `fetch`, Node HTTP clients, or another
unrestricted network client. They must use official APIs or feeds, return
normalized data, preserve attribution, and throw the stable connector error
classes.

## RSS / Atom connector review

- Protocol: public RSS 2.0, Atom, Media RSS, and standard enclosures only.
- Authentication: none; credentials in feed URLs are rejected.
- Requests: one bounded feed request per page; no linked page or media fetches.
- Incremental state: `ETag` and `Last-Modified` are sent as conditional request
  headers, and a `304 Not Modified` produces an empty page without advancing to
  invented state.
- Pagination: feed entries are capped by validated configuration and connector
  context limits; feeds do not trigger follow-up page requests.
- IDs: GUID/Atom ID, then canonical entry link, then a deterministic SHA-256
  fallback for linkless entries.
- Content: embedded entry HTML is bounded and used only to extract plain text
  and media URLs. It is never returned as renderable HTML.
- Rating: explicit adult/sensitive/safe metadata is mapped; ambiguous content
  remains `UNKNOWN`.
- XML: document/entity declarations are rejected, entity processing is
  disabled, nesting and response bytes are bounded, and malformed XML fails
  closed.
- Fixtures: connector tests use synthetic/sanitized RSS and Atom documents; the
  integration suite validates through a controlled loopback feed server enabled
  only in the test environment.

## Lemmy connector review

- Official API: public `GET /api/v3/community` and
  `GET /api/v3/post/list` endpoints documented by the Lemmy project and its
  official `lemmy-js-client`. The implementation was reviewed against Lemmy
  0.19.18 / API v3 on 2026-07-22. The official API v4 upgrade guide documents a
  cursor transition for Lemmy 1.0; MirthSpool does not guess at v4 shapes or
  silently fall back to HTML. An explicit reviewed compatibility update is
  required before selecting v4.
- Authentication: none. M10 supports public communities only and does not send
  login tokens, vote, comment, post, or access private communities.
- Configuration: one HTTP(S) instance origin, a local community name or numeric
  identifier, supported sort mode, bounded minimum score, content policy,
  1–50 posts per page, and 1–10 pages per run. The global worker request, byte,
  item, page, and duration ceilings still take precedence.
- Connectivity: resolves only the configured community through the instance API
  and returns a sanitized preview containing the instance hostname, community
  name/title, community ID, and compatibility label. Actor links and outbound
  post links are never followed.
- Pagination: API v3 page numbers are treated as mutable positions, never as
  globally monotonic IDs. A bounded checkpoint records the next page and up to
  100 already emitted opaque post IDs, suppressing shifted boundary duplicates.
  A completed run resets to page one so new insertions are observed on the next
  poll. Database uniqueness on `(sourceId, externalId)` provides the final
  idempotency boundary.
- Attribution: normalized community names are stored as
  `community@instance-host`; therefore identically named communities on separate
  instances remain distinct. The provider author, score, comment count,
  canonical ActivityPub post URL, publication/update times, and source display
  name are retained.
- Media: direct raster/video URLs recognized from typed image details or safe
  extensions are normalized. Provider thumbnails may be retained as previews.
  Unknown external links remain `LINK` assets; their destination pages are never
  fetched or scraped. SVG and HTML are never promoted to inline media.
- Rating: Lemmy post/community `nsfw` metadata maps to `ADULT`, is excluded, or
  is mapped to `SENSITIVE` according to the source policy. Missing metadata is
  `UNKNOWN`, never implicitly safe. Explicit `CW:`/warning hints are retained as
  plain bounded text.
- Removal: deleted/removed posts set a per-occurrence provider-removal timestamp.
  Canonical content becomes `REMOVED_AT_SOURCE` only when no active occurrence
  remains; unrelated attribution is not erased.
- Errors and rate behavior: 401/403, Lemmy private/banned errors, missing
  communities, 429 with `Retry-After`, transient 5xx responses, and malformed
  JSON map to stable sanitized connector errors and existing source-health /
  bounded-backoff behavior. Successful rate-limit headers are recorded when an
  instance supplies them. MirthSpool does not evade or parallelize around
  instance limits.
- Federation caveat: the connector queries the configured instance's local API
  view. Federation delay, moderation, and availability differ by instance, so a
  remote community visible elsewhere may be absent or stale here. Cross-instance
  occurrences remain separate.
- Fixtures: `tests/fixtures/lemmy` is wholly synthetic, contains no account data,
  and covers images, video/link posts, text fallback, NSFW policy, provider
  removal, mutable pagination, missing/restricted communities, rate limiting,
  and malformed responses. Tests mock the hardened HTTP boundary; CI has no live
  Lemmy dependency.

References: [official Lemmy API documentation](https://join-lemmy.org/docs/contributors/04-api.html),
[official 0.19 client types](https://join-lemmy.org/lemmy-js-client-docs/v0.19/interfaces/GetPosts.html),
and the [official API v4 upgrade guide](https://join-lemmy.org/docs/contributors/09-api-v4.html).
No unsupported HTML scraping is used.

## Mastodon-compatible connector review

- Official API: public `GET /api/v2/instance`, `GET /api/v1/tags/:name`,
  `GET /api/v1/timelines/tag/:name`, `GET /api/v1/accounts/lookup`, and
  `GET /api/v1/accounts/:id/statuses` endpoints from the Mastodon client API.
  The implementation was reviewed against the official documentation current on
  2026-07-22. It targets the Mastodon 4.x public API surface and records both the
  human-readable server version and machine-readable `api_versions.mastodon`
  value when supplied. Compatible forks must return the validated shapes; there
  is no permissive HTML fallback.
- Authentication and visibility: none. Only unauthenticated public hashtag and
  public-account timelines are supported. Every returned status and any boosted
  original must declare `visibility: public`; unlisted, private, and direct
  statuses are discarded even if a server returns them unexpectedly. Instances
  that disable public preview produce a stable restricted-source health error.
- Configuration: one HTTP(S) instance origin, `HASHTAG` or `ACCOUNT` mode, a
  validated hashtag/account identifier, optional BCP 47 language filter,
  include-boosts policy, 1–4 minimum supported attachments, 1–40 statuses per
  page, and 1–10 pages per run. Global request, byte, item, page, retry, and
  duration ceilings remain authoritative.
- Connectivity: performs at most three bounded calls: instance diagnostics,
  tag/account resolution, and a media-only timeline sample. Preview output is
  limited to the resolved target, instance host/title/version, source mode, and
  API compatibility number.
- Pagination: provider status IDs and `Link` values remain opaque strings.
  `since_id` is retained after a completed run; multi-page runs retain the newest
  outer status ID, next URL, account ID, page number, and at most 100 emitted
  original IDs. A next link is accepted only when it has the configured origin,
  exact timeline pathname, no credentials or fragment, and an allowlisted set of
  pagination parameters. Cross-origin and cross-endpoint links fail closed.
- Boosts: disabled by default. When enabled, the original status ID, author,
  URL, warning, counters, and media define the occurrence. The booster is stored
  separately as attribution. Multiple boosts of one original therefore converge
  on `(sourceId, originalStatusId)` instead of producing feed spam.
- Attribution: author display names are reduced to plain text and paired with a
  full instance-aware handle. The configured instance, optional booster,
  language, reply/favourite/boost counters, status URL, and publication/edit
  times are preserved.
- Media: the provider's image, GIFV, and video attachment URLs and preview
  metadata are normalized without fetching their destinations. GIFV is treated
  as video. Unsupported and audio-first attachments are ignored; a status must
  still meet the configured supported-media minimum. Alt text is bounded and
  reduced to inert plain text.
- Markup and rating: status content, spoiler text, display names, and attachment
  descriptions are stripped of active blocks/tags, entity-decoded, control-
  filtered, whitespace-normalized, and length-bounded before persistence. Raw
  provider HTML is neither stored nor rendered. A sensitive flag or non-empty
  spoiler maps to `SENSITIVE` and preserves the warning; otherwise an explicitly
  public, non-sensitive status maps to `SAFE`.
- Editing and removal: `edited_at` is retained. A compatible provider's bounded
  `deleted_at` extension marks the occurrence removed and drops body/media.
  Standard Mastodon timelines normally omit deleted statuses, so absence alone
  is not interpreted as deletion and does not trigger repeated lookup traffic.
- Errors and rate behavior: public-preview restrictions, missing/suspended
  accounts or tags, invalid identifiers, rate limiting with `Retry-After`,
  transient upstream errors, malformed JSON/shapes, and rejected pagination map
  to stable sanitized connector errors and the existing source-health/backoff
  system. Provider response bodies are never exposed.
- Fixtures: `tests/fixtures/mastodon` is synthetic and covers hashtag/account
  modes, local and remote-style handles, multiple images, GIFV/video, unsupported
  audio, alt text, spoilers, sensitivity, edits/removal, boosts, mutable
  pagination, rate limiting, malformed data, and XSS-shaped fields. Unit tests
  mock the hardened boundary; integration and browser tests use a local fixture
  instance. CI has no live Mastodon dependency.

References: [official timeline methods](https://docs.joinmastodon.org/methods/timelines/),
[official account methods](https://docs.joinmastodon.org/methods/accounts/),
[official instance methods](https://docs.joinmastodon.org/methods/instance/),
[Status entity](https://docs.joinmastodon.org/entities/Status/), and
[MediaAttachment entity](https://docs.joinmastodon.org/entities/MediaAttachment/).
No unsupported HTML scraping is used.

## Outbound request policy

The hardened client permits only HTTP and HTTPS, rejects URL credentials, and
allows ports 80/443 unless an administrator explicitly changes
`MIRTHSPOOL_SOURCE_ALLOWED_PORTS`. It resolves and validates every destination
and redirect, pins each request to an approved address, strips credentials on a
cross-origin redirect, identifies itself as MirthSpool, limits redirects, and
enforces connect/header/idle/body/total timeouts plus compressed and decompressed
byte limits. Response content types are allowlisted by the connector.

Loopback, private, link-local, carrier-grade NAT, metadata, documentation,
benchmark, multicast, unspecified, reserved, IPv4-mapped, and local IPv6 ranges
are rejected by default. `ALLOW_PRIVATE_SOURCE_URLS=true` is an explicit homelab
exception and should be enabled only when every configured source is trusted.
It does not enable private media fetching;
`ALLOW_PRIVATE_MEDIA_URLS` remains a separate, disabled setting reserved for the
media milestone.

## Credential storage

`APP_ENCRYPTION_KEY` must be a base64-encoded 32-byte key generated independently
from all other deployment secrets. Source credentials are serialized into a
bounded JSON object and encrypted using AES-256-GCM with a fresh 96-bit nonce.
The source ID, credential kind, and label are authenticated as associated data.
The envelope stores its algorithm and `APP_ENCRYPTION_KEY_VERSION` for a future
controlled re-encryption workflow.

Plaintext exists only during validation or encryption and is never returned by
source APIs, written to audit metadata, or logged. Rotating a `(source, kind,
label)` credential replaces its encrypted payload atomically. Before changing a
production key or key version, pause workers and complete a reviewed
re-encryption procedure; simply replacing the key makes existing credentials
undecryptable.

## Administrative API

All routes require an administrator session. Mutations require same-origin JSON
and bounded request bodies.

- `GET/POST /api/sources`
- `GET/PATCH/DELETE /api/sources/:sourceId`
- `POST /api/sources/:sourceId/pause`
- `POST /api/sources/:sourceId/resume`
- `POST /api/sources/:sourceId/validate`
- `POST /api/sources/:sourceId/credentials`

Source kind is immutable. Poll intervals are limited to 60–86,400 seconds,
priorities to -100–100, configuration to 16 KiB, validation to three outbound
requests and five attempts per five minutes, and listings to 100 sources. Delete
is idempotent and soft; source history and attribution are retained. Validation
responses contain only stable codes and safe summaries—never provider bodies,
tokens, resolved addresses, ciphertext, or stack traces.
