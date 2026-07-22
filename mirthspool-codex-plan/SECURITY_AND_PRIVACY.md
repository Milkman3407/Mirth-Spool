# Security and Privacy

## 1. Security objectives

MirthSpool must protect administrator credentials, prevent remote sources from reaching unintended network resources, avoid serving attacker-controlled active content, and keep resource consumption bounded.

This is a self-hosted application, but the internet content it processes is untrusted.

## 2. Threat model

Primary threats:

1. Malicious source URLs causing SSRF.
2. DNS rebinding or redirects from a public host to a private address.
3. Oversized responses, decompression bombs, image bombs, or endless streams.
4. Active HTML/SVG/script content rendered as media.
5. Open-proxy abuse.
6. Credential or token leakage through logs, errors, browser bundles, or raw payloads.
7. Account brute force, setup races, session theft, CSRF, and XSS.
8. Queue flooding through manual refresh or malformed pagination.
9. Duplicate storms and unbounded database/cache growth.
10. Malicious filenames, path traversal, or object-key collisions.
11. Dependency and container supply-chain compromise.
12. Backups exposing credentials or personal preferences.
13. Provider content causing unsafe redirects or phishing links.
14. Cross-user data exposure in future multi-user mode.

## 3. Authentication and sessions

- Use an established authentication library compatible with the framework.
- Hash passwords with Argon2id using reviewed parameters.
- Require a minimum password length and reject known-empty/default values.
- Close first-run setup atomically when the first administrator is created.
- Rate-limit setup and login by IP and account identifier.
- Use secure, HTTP-only, same-site cookies in production.
- Rotate session identifiers after login.
- Support logout and session revocation.
- Do not enable public registration.
- Protect state-changing browser requests against CSRF.
- Audit repeated authentication failures without storing submitted passwords.

## 4. Authorization

- Enforce authorization server-side.
- Treat every source, credential, settings, cache, metrics, and refresh operation as administrative.
- Feed and library data require authentication in the MVP.
- Cached media requires authorization.
- Never rely only on hidden buttons or client-side route guards.

## 5. SSRF defenses

All outbound source/media requests use one hardened client.

Required controls:

- Allow only `http:` and `https:`.
- Reject embedded credentials in URLs.
- Normalize hostnames.
- Resolve DNS and reject loopback, link-local, multicast, unspecified, metadata-service, and private ranges by default.
- Re-check the resolved address on every redirect.
- Limit redirects.
- Block non-standard ports by default or make them an explicit administrator setting.
- Support an explicit `ALLOW_PRIVATE_SOURCE_URLS` mode for trusted homelab feeds, with a prominent warning and separate media-fetch policy.
- Use connect, header, idle, body, and total timeouts.
- Enforce compressed and decompressed byte limits.
- Abort on unexpected content type.
- Do not send provider credentials to a redirected host unless the connector explicitly authorizes it.
- Use a clear MirthSpool user agent.

## 6. Media safety

- Do not render remote HTML as media.
- Reject or download SVG as an attachment unless a future reviewed sanitizer is added.
- Allowlist safe raster image and supported video MIME types.
- Verify magic bytes rather than trusting extensions or headers alone.
- Apply maximum dimensions, frames/duration where inspectable, and byte limits.
- Generate storage keys internally; never use upstream paths directly.
- Set `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and restrictive referrer policy.
- Avoid `dangerouslySetInnerHTML`; sanitize any provider text that must support markup.
- Videos are muted by default.
- Links to originals use safe `rel` attributes and do not inherit opener access.

## 7. Secrets

- Validate that production secrets are not defaults.
- Keep deployment secrets in environment variables or mounted secret files.
- Encrypt per-source credentials at rest with an application encryption key.
- Use a versioned AES-256-GCM or similarly reviewed authenticated-encryption envelope.
- Support key version metadata for future rotation.
- Never expose plaintext credentials through GET APIs.
- Redact authorization headers, cookies, tokens, passwords, encryption keys, and provider secrets from logs.
- Ensure client bundles do not contain server-only variables.

## 8. Input validation

Validate:

- URL schemes and lengths.
- Hostnames, instance names, hashtags, community names, subreddits, and identifiers.
- Poll intervals and priorities within safe bounds.
- Feed limits and cursor integrity.
- Search query lengths and filter counts.
- JSON object size and unknown fields.
- File/media metadata.
- Connector checkpoints before use.

Use parameterized database access through the ORM. Avoid constructing raw SQL; when required, bind parameters.

## 9. Rate limiting and quotas

Apply limits to:

- Login and setup.
- Source validation.
- Manual refresh.
- Search.
- Cache fetch and media serving.
- Administrative destructive actions.

Every ingestion run has maximum:

- Duration.
- Pages.
- Items.
- Provider requests.
- Response bytes.
- Retries.
- Follow-up jobs.

Every cache has:

- Per-object size.
- Total quota.
- TTL or retention.
- Eviction policy.

## 10. Privacy

- No third-party analytics or advertising.
- Minimize stored account data.
- Keep view history configurable.
- Document that remote media may reveal a browser or server IP to the source.
- Do not send feed contents to external AI services.
- Backup documentation must cover encryption and access controls.
- Logs must not contain full remote query strings when they may contain tokens.

## 11. Security headers

Production responses should include an appropriate baseline:

- Content Security Policy tailored to known media origins or proxy mode.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy`.
- Frame-ancestor protection.
- HSTS when TLS is correctly terminated.
- Permissions Policy restricting unnecessary browser capabilities.

Avoid a CSP so broad that it defeats its purpose. Source-origin allowlisting may require an intentional remote-media strategy.

## 12. Dependency and container security

- Pin lockfiles and container base-image digests or controlled tags.
- Run containers as non-root.
- Use minimal runtime images and multi-stage builds.
- Avoid mounting the Docker socket.
- Drop Linux capabilities where practical.
- Make filesystems read-only except required writable paths.
- Generate an SBOM for releases.
- Run dependency, secret, and container scans in CI.
- Review automated dependency upgrades before merge.

## 13. Incident and recovery expectations

Document how to:

- Revoke/rotate provider credentials.
- Rotate the application encryption key through a controlled re-encryption process.
- Invalidate all sessions.
- Pause all workers.
- Disable a compromised source.
- Purge a content item and cached bytes.
- Restore a known-good backup.
- Collect sanitized diagnostics.

## 14. Security acceptance rule

No milestone may be considered complete if it knowingly introduces an unauthenticated administrative endpoint, unrestricted remote fetch, plaintext credential storage, unsanitized active content, or unbounded ingestion/cache path.
