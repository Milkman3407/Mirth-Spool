# Local runtime operations

M01 runs four services through Docker Compose: the Next.js web process, the no-op worker, PostgreSQL, and Redis. PostgreSQL owns durable state. Redis contains only reconstructable coordination state.

## First start

Node.js and pnpm are needed for host-side checks. Docker Engine and Docker Compose v2 are needed for the runtime.

```bash
cp .env.example .env
```

Edit `.env` before continuing:

- Replace `MIRTHSPOOL_DATABASE_PASSWORD` with at least 24 randomly generated characters. It is required and secret.
- Set `MIRTHSPOOL_PUBLIC_ORIGIN` to the browser-visible HTTP(S) origin. For direct local use, use `http://localhost:3000`.
- Keep `.env` out of source control.

Start and wait for the services:

```bash
pnpm compose:up
docker compose ps
```

Open `http://localhost:3000`. The host binding is loopback-only by default. PostgreSQL and Redis publish no host ports in the normal Compose file.

## Health and logs

```bash
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
pnpm compose:logs
docker compose logs --tail=100 worker
```

Liveness checks only the web process. Readiness checks PostgreSQL and Redis with a bounded timeout and returns a sanitized `503` response when either is unavailable.

## Stop and reset

Stop containers while preserving named volumes:

```bash
pnpm compose:down
```

Delete containers and both named volumes:

```bash
pnpm compose:reset
```

`compose:reset` permanently deletes the local PostgreSQL database and reconstructable Redis data. It is intended only for an explicit clean reset.

## Integration tests

```bash
pnpm test:integration
```

The command uses an isolated Compose project with loopback-only test ports, owns its test volumes, and removes those volumes when the run finishes.

## TLS and reverse proxies

MirthSpool does not bundle a reverse proxy. For non-local access, terminate TLS at a separately maintained reverse proxy on the same host or trusted private network, forward requests to the loopback web binding, preserve the original host/protocol headers, and set `MIRTHSPOOL_PUBLIC_ORIGIN` to the external HTTPS origin. Do not expose PostgreSQL or Redis through the proxy or host port mappings.
