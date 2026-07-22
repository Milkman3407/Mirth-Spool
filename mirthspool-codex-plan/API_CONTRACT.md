# API Contract

The API is primarily consumed by MirthSpool's own web client, but it should use stable, documented semantics. Exact route placement may use Next.js route handlers.

## 1. Conventions

- JSON request and response bodies unless serving media.
- UTF-8.
- UTC ISO 8601 timestamps.
- Stable opaque string IDs.
- Cursor pagination.
- Zod validation at every HTTP boundary.
- Authentication required except where explicitly marked public.
- State-changing requests protected against CSRF.
- Idempotent `PUT`/`DELETE` semantics for user actions.
- A request ID included in response headers and logs.

### Error shape

```json
{
  "error": {
    "code": "SOURCE_AUTH_FAILED",
    "message": "The source credentials were rejected.",
    "requestId": "req_...",
    "details": {}
  }
}
```

`message` must be safe for the client. Provider response bodies, tokens, stack traces, and private network details must not be exposed.

### Cursor page shape

```json
{
  "items": [],
  "nextCursor": "opaque-or-null",
  "hasMore": false
}
```

Cursors should be signed or otherwise tamper-resistant when they contain query state.

## 2. Health endpoints

### `GET /api/health/live`

Public. Confirms the process is running. It should not perform dependency checks.

Returns `200 OK`:

```json
{
  "requestId": "req_...",
  "service": "web",
  "status": "live",
  "timestamp": "2026-01-02T03:04:05.000Z"
}
```

### `GET /api/health/ready`

Public but minimal. Confirms required dependencies for the process role. Do not expose connection strings or internal topology.

Returns `200 OK` with `status: "ready"` when all required dependencies are available, or `503 Service Unavailable` with `status: "not_ready"`. The response otherwise uses the liveness shape and intentionally omits dependency names and errors. Both endpoints return the request ID in `X-Request-Id` and disable caching.

## 3. Setup and authentication

### `GET /api/setup/status`

Public. Returns only whether first-run setup is open.

### `POST /api/setup`

Public only while no user exists. Creates the first administrator in a transaction and closes setup. Strictly rate-limited.

### Authentication routes

Use the selected established authentication library's conventional routes. Document:

- Login.
- Logout.
- Session retrieval.
- Session revocation.
- Cookie settings.
- CSRF behavior.

Public registration must not be enabled.

## 4. Sources

### `GET /api/sources`

Returns source summaries and health fields.

### `POST /api/sources`

Creates a source after connector-specific validation. Secrets use a dedicated field and must not be echoed back.

### `GET /api/sources/:sourceId`

Returns sanitized configuration and recent health summary.

### `PATCH /api/sources/:sourceId`

Updates mutable configuration. Connector kind should be immutable; replacement may require a new source.

### `DELETE /api/sources/:sourceId`

Soft-disables or soft-deletes by default. Purge behavior must require an explicit separate action and confirmation.

### `POST /api/sources/:sourceId/validate`

Performs a bounded connectivity/configuration check.

### `POST /api/sources/:sourceId/refresh`

Enqueues a manual refresh and returns `202 Accepted` with a job/run reference. Rate-limited.

### `GET /api/sources/:sourceId/runs`

Cursor-paginated ingestion history.

### `POST /api/sources/:sourceId/credentials`

Creates or rotates encrypted credentials. Never returns plaintext after write.

## 5. Feed and content

### `GET /api/feed`

Query parameters:

```text
mode=new|hot|random|unseen
cursor=<opaque>
limit=1..50
seed=<required or generated for random>
sourceId=<repeatable>
mediaKind=<repeatable>
rating=safe|sensitive|adult
from=<timestamp>
to=<timestamp>
tag=<repeatable>
includeSeen=true|false
```

Response items should include:

- Content ID.
- Title.
- Publication time.
- Content rating and warning.
- Selected primary source attribution.
- Alternate source count.
- Media metadata and safe render URL.
- Favorite, hidden, and viewed state for the current user.
- Original post URL.
- A ranking explanation summary for `hot`, not an opaque model output.

### `GET /api/content/:contentId`

Returns full normalized metadata, media assets, attribution occurrences, tags, and current-user actions.

### `GET /api/content/:contentId/sources`

Returns provider occurrences for duplicate-group transparency.

## 6. User actions

### `PUT /api/content/:contentId/favorite`
### `DELETE /api/content/:contentId/favorite`
### `PUT /api/content/:contentId/hide`
### `DELETE /api/content/:contentId/hide`
### `PUT /api/content/:contentId/view`

Operations are idempotent. Return current action state.

### `GET /api/library/favorites`
### `GET /api/library/hidden`
### `GET /api/library/history`

Cursor-paginated. History may be disabled by setting; if disabled, return a stable feature-disabled error or omit the route from navigation.

## 7. Search

### `GET /api/search`

Parameters:

```text
q=<query>
cursor=<opaque>
limit=1..50
sourceId=<repeatable>
mediaKind=<repeatable>
rating=<repeatable>
tag=<repeatable>
favorite=true|false
hidden=true|false
from=<timestamp>
to=<timestamp>
```

Search must use parameterized database queries and a bounded query length.

## 8. Settings and operations

### `GET /api/settings`
### `PATCH /api/settings`

Returns/updates validated non-secret product settings.

### `GET /api/admin/queue`

Protected administrative summary only; no raw job payloads containing secrets.

### `GET /api/admin/cache`
### `POST /api/admin/cache/evict`

Returns quota use and triggers bounded eviction.

### `GET /api/admin/metrics`

Protected unless a separate metrics authentication mechanism is configured.

## 9. Cached media

### `GET /api/media/:mediaId`

This route may serve cached bytes. It must:

- Look up an internal media ID.
- Require authentication.
- Never accept an arbitrary upstream URL.
- Apply content-rating and authorization checks.
- Set a safe `Content-Type`.
- Set `X-Content-Type-Options: nosniff`.
- Support conditional and range requests where implemented.
- Avoid leaking filesystem paths or storage credentials.

Remote-only assets may be returned to the browser as provider URLs when allowed by policy; the server must not fetch them through this route unless they are in an approved cache job.

## 10. Internal connector contract

Suggested TypeScript shape:

```ts
export interface MemeConnector<TConfig, TCheckpoint = unknown> {
  readonly kind: SourceKind;

  validateConfig(input: unknown): TConfig;

  validateConnectivity(
    context: ConnectorContext,
    config: TConfig
  ): Promise<ConnectivityResult>;

  fetchPage(
    context: ConnectorContext,
    config: TConfig,
    checkpoint: TCheckpoint | null
  ): Promise<ConnectorPage<TCheckpoint>>;
}

export interface ConnectorPage<TCheckpoint> {
  posts: NormalizedSourcePost[];
  nextCheckpoint: TCheckpoint | null;
  hasMore: boolean;
  rateLimit?: {
    remaining?: number;
    resetAt?: string;
  };
}
```

`ConnectorContext` supplies a hardened HTTP client, logger, clock, credentials,
limits, cancellation signal, and an optional short-lived OAuth token-cache
boundary. Connectors must not instantiate unrestricted HTTP clients directly.

## 11. Versioning

The internal API may remain unversioned for v0.1. Before third-party clients are encouraged, introduce `/api/v1` or a documented compatibility policy. Breaking changes must be called out in release notes.
