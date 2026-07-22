# M01 — Local Runtime and App Shell

**Depends on:** M00  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Make the complete process topology run locally through Docker Compose: web application, worker, PostgreSQL, and Redis. Provide health checks and a minimal authenticated-looking shell without implementing authentication yet.

## Required deliverables

- A bootable Next.js web application.
- A bootable Node.js worker process.
- Dockerfiles using multi-stage builds and non-root runtime users.
- A Docker Compose development/deployment baseline with PostgreSQL and Redis.
- Liveness/readiness endpoints and container health checks.
- A minimal responsive application shell with placeholder navigation.
- Documented local startup, shutdown, logs, and clean-reset commands.

## Implementation tasks

- Initialize the Next.js App Router application in `apps/web` with TypeScript.
- Create `apps/worker` with a long-running process, structured logger, graceful shutdown, and dependency readiness checks.
- Add PostgreSQL and Redis clients through dedicated packages or adapters, but do not introduce the full domain schema.
- Implement `/api/health/live` and `/api/health/ready` according to `API_CONTRACT.md`.
- Ensure the web readiness endpoint checks PostgreSQL and Redis with strict short timeouts.
- Add worker startup checks and a no-op heartbeat/log message suitable for observing health.
- Create a root layout, feed placeholder, sources placeholder, settings placeholder, and status placeholder.
- Add Compose networks, named volumes, health checks, dependency conditions, and restart policies appropriate for self-hosting.
- Set container users, writable paths, and development bind mounts intentionally.
- Add graceful SIGTERM handling to web/worker where the framework does not already provide it.
- Document how reverse-proxy TLS is expected to terminate without bundling a specific proxy.

## Required behavior and contracts

- The liveness endpoint must not fail merely because PostgreSQL or Redis is unavailable.
- The readiness endpoint must return a controlled non-ready status without exposing connection details.
- Redis data is treated as reconstructable; PostgreSQL is durable.
- The worker must not perform ingestion yet.
- The app shell must contain no upload control.
- Production containers must run as non-root.
- Compose must not expose PostgreSQL or Redis publicly by default.

## Test requirements

- Unit-test health-status mapping and configuration validation.
- Integration-test readiness with healthy and unavailable PostgreSQL/Redis.
- Build both production container images.
- Run `docker compose config`.
- Smoke-test `docker compose up` and verify container health.
- Verify SIGTERM produces a clean worker shutdown.

## Acceptance criteria

- [ ] A clean checkout can start all four services with Docker Compose.
- [ ] The web shell loads and placeholder routes render.
- [ ] Liveness and readiness semantics match the API contract.
- [ ] PostgreSQL and Redis are not bound to public interfaces by default.
- [ ] Web and worker images run as non-root.
- [ ] Logs are structured and include service name and environment.
- [ ] Startup/reset/logging commands are documented.

## Out of scope

- Database domain schema and migrations.
- Authentication.
- Queues and scheduled jobs.
- Real feed content.
- Reverse-proxy or TLS automation.

## Governing documents to read

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)

## Implementation notes

For development, Compose may use framework dev servers. Production Docker stages must build optimized artifacts. Do not put secrets into image layers. Use health checks that are inexpensive and have bounded timeouts.

## Codex handoff prompt

```text
Implement only M01 — Local Runtime and App Shell.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
