# Troubleshooting

- `migrate` cannot connect: confirm PostgreSQL is healthy, the Compose project
  uses the same `.env`, and the database password has not changed. Do not expose
  port 5432 as a workaround.
- Web readiness fails: inspect `docker compose logs --tail=200 web`; verify
  PostgreSQL, Redis, media-volume readability, public origin, secrets, and proxy
  headers. Logs intentionally omit secrets and provider bodies.
- Worker readiness fails: inspect bounded queue/database/storage diagnostics,
  disk space, and volume permissions. Restarting is safe; do not delete Redis or
  volumes until a verified backup exists.
- Login or CSRF failures behind a proxy: verify the external HTTPS origin is
  exact and the proxy overwrites both required forwarding headers. Never broaden
  trusted proxy IPs to silence the check.
- Source validation fails: use the stable error code and connector guide. Check
  approval/credentials/rate limits and public accessibility; do not add scraping
  or bypass provider restrictions.
- Media is remote-only or blocked: review cache policy, quota, rating, MIME and
  size limits, SSRF decisions, and private-media setting. Do not proxy arbitrary
  URLs.
- Disk pressure: pause ingestion, inspect database/cache metrics, run bounded
  retention and cache reconciliation, then increase capacity or lower an
  explicit policy. Never delete named-volume contents manually.
- Suspected credential/key loss: pause sources and workers, isolate the host,
  preserve logs and backups, and follow the recovery runbook. A backup without
  its separately escrowed encryption key cannot decrypt source credentials.
