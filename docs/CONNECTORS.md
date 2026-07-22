# Connector SDK and source-management boundary

M04 defines the provider-independent boundary. M05 adds the first provider:
public RSS 2.0 and Atom feeds. Lemmy, Mastodon, and Reddit remain unavailable
until their own reviewed milestones.

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
