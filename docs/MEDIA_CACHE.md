# Media cache operations

MirthSpool remains remote-only by default. The optional media cache stores only
media discovered through configured official APIs or feeds; it does not provide
manual upload or arbitrary-URL fetch functionality.

## Policy and bounds

An administrator can configure the cache on `/settings`:

- `NONE` keeps provider URLs in the browser and schedules no downloads.
- `FAVORITES_ONLY` caches eligible media referenced by favorited content and
  protects favorites from quota eviction.
- `TTL` caches eligible media until its configured expiration.
- `ALL_WITHIN_QUOTA` caches eligible discovered media within the quota.

The allowed media-kind set, per-object byte limit, total quota, TTL, and worker
concurrency are all bounded. The worker reserves the per-object maximum under a
PostgreSQL advisory transaction lock before starting a fetch, so concurrent jobs
cannot overcommit the configured quota. Duplicate queueing and processing are
idempotent. Eviction prefers expired, non-favorite, least-recently-accessed
objects. A purge removes local copies while retaining source attribution and
remote URLs.

## Storage and delivery

Docker Compose mounts the `media-cache` volume read-write in the worker and
read-only in the web container at `/var/lib/mirthspool/media`. The local adapter
uses server-generated opaque keys, same-filesystem temporary files, bounded
streaming writes, `fsync`, and atomic rename. Partial downloads never become
visible. Database metadata is committed only after the object is durable, and a
bounded maintenance scan removes orphan files.

Cached bytes are available only from `GET` or `HEAD /api/media/{mediaId}` after
authentication. The route accepts a UUID only—never a URL or storage path—and
applies the configured content-rating ceiling. It supports conditional requests
and single byte ranges for video, rate limits access, and sets private caching,
`nosniff`, sandbox CSP, referrer, and safe inline-disposition headers.

## Outbound media security

Media downloads use a separate hardened client and private-network policy from
source ingestion. Every initial URL and redirect is parsed and validated; DNS is
resolved and checked before each connection; credentials, fragments, unsupported
schemes, disallowed ports, private/reserved addresses, redirect overflow,
timeouts, compressed bodies, and decompressed bodies are rejected by default.
Magic-byte validation permits bounded PNG, JPEG, GIF, WebP, MP4, and WebM only.
HTML, SVG, unknown formats, and declared/detected MIME mismatches are blocked.

`ALLOW_PRIVATE_MEDIA_URLS=true` is intended only for controlled local fixtures
or explicitly trusted internal providers. When it is enabled, restrict
`MIRTHSPOOL_MEDIA_ALLOWED_PORTS` to the exact required ports. This exception is
independent of `ALLOW_PRIVATE_SOURCE_URLS`.

## Configuration

- `MIRTHSPOOL_MEDIA_STORAGE_PATH` must be an absolute path. The Compose default
  is `/var/lib/mirthspool/media`.
- `MIRTHSPOOL_MEDIA_CACHE_CONCURRENCY` controls bounded worker concurrency and
  defaults to `2`.
- `MIRTHSPOOL_MEDIA_ALLOWED_PORTS` is a comma-separated allowlist and defaults
  to `80,443`.
- `ALLOW_PRIVATE_MEDIA_URLS` defaults to `false`.

If storage health is unavailable, remote-only browsing continues to work. Cache
jobs fail visibly with bounded error codes; operators should restore the volume,
refresh cache status, and retry by running policy eviction or allowing the
scheduler to reconsider eligible media. Use the explicit `PURGE CACHE`
confirmation in settings to queue removal of all cached objects.
