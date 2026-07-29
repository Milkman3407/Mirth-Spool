# Install MirthSpool v0.1

## Supported host and prerequisites

v0.1.0 is tested on a clean Linux host with the `linux/amd64` architecture,
Docker Engine, and Docker Compose v2. Allocate at least 4 CPU cores, 8 GiB RAM,
20 GiB free storage plus the planned media-cache quota, and a private backup
destination. Production requires a DNS name and a TLS-terminating reverse proxy;
MirthSpool intentionally does not automate certificates.

Download `compose.yaml`, `compose.release.yaml`, and `.env.example` from the
exact `v0.1.0` tag. Download `web-image.txt` and `worker-image.txt` from that
GitHub release and place each complete `ghcr.io/...@sha256:...` reference in
`.env` as `MIRTHSPOOL_WEB_IMAGE` and `MIRTHSPOOL_WORKER_IMAGE`. Digest references
are the deployment authority; the `0.1.0` tags are conveniences.

## Configure and start

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 32
openssl rand -hex 32
```

Use the first output for `APP_ENCRYPTION_KEY`. Use separate random values of at
least 32 characters for `MIRTHSPOOL_AUTH_SECRET` and
`MIRTHSPOOL_DATABASE_PASSWORD`. Set the HTTPS `MIRTHSPOOL_PUBLIC_ORIGIN`, image
digest references, cache/retention limits, and only reviewed network exceptions.
Keep `.env` and the encryption key out of backups and source control; escrow the
key separately.
Never post `.env`, rendered Compose output, `docker inspect` output, or logs to
GitHub. Validate Compose without rendering secrets by using
`docker compose config --quiet`.

```bash
pnpm release:images:verify
docker compose -f compose.yaml -f compose.release.yaml config --quiet
docker compose -f compose.yaml -f compose.release.yaml pull
docker compose -f compose.yaml -f compose.release.yaml up -d --wait postgres redis
docker compose -f compose.yaml -f compose.release.yaml --profile tools run --rm migrate
docker compose -f compose.yaml -f compose.release.yaml up -d --wait web worker
curl --fail http://127.0.0.1:3000/api/health/ready
```

The migrator uses the same digest-pinned worker image, runs once as non-root,
and needs only the private database network. The application binds loopback by
default. Do not publish PostgreSQL, Redis, diagnostics, metrics, or cached-media
internals directly.

Open the configured HTTPS origin and complete the one-time administrator setup.
Setup closes transactionally after the first user. Then configure sources using
[the four connector guides](CONNECTOR_SETUP.md), verify rating policy, and test
favorite, hide, history, search, and cache behavior with non-private content.

## Reverse proxy and TLS

Use any maintained proxy that can terminate TLS, preserve Host, set the original
HTTPS scheme, overwrite `X-Forwarded-For`, and set
`X-MirthSpool-Forwarded-By` to its own exact address. Add that address to
`MIRTHSPOOL_TRUSTED_PROXY_IPS`; never trust a broad subnet. Keep the Compose HTTP
port loopback-bound, impose request-size/time limits, and restrict the origin to
authenticated users. See [operations and recovery](OPERATIONS_SECURITY_AND_RECOVERY.md).

## Capacity and privacy

Remote-only media is the default and exposes the viewer's IP/user agent to the
provider when viewed. Cached mode shifts that request to the server and consumes
the bounded local volume. Review [media cache operations](MEDIA_CACHE.md), leave
private-media access disabled unless explicitly needed, set quota/TTL policies,
and monitor database, cache bytes, queue depth, source failures, and free disk.

Back up and restore-test before adding private credentials or irreplaceable user
state. The exact procedures are in
[operations, security, and recovery](OPERATIONS_SECURITY_AND_RECOVERY.md).
