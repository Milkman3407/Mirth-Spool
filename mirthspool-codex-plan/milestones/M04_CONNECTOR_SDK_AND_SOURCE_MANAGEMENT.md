# M04 — Connector SDK and Source Management

**Depends on:** M03  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Define the provider-independent connector boundary and deliver authenticated source management, configuration validation, credential encryption, and source health views before implementing individual providers.

## Required deliverables

- A shared connector interface and normalized provider types.
- A hardened outbound HTTP client boundary.
- Connector registry keyed by source kind.
- Authenticated source CRUD, validation, pause/resume, and health APIs.
- Source-management UI.
- Encrypted source-credential storage and rotation boundary.
- Provider-independent error classification.

## Implementation tasks

- Implement connector types from `API_CONTRACT.md` in `packages/connectors`.
- Define Zod schemas for normalized posts, media assets, connector pages, checkpoints, and connectivity results.
- Create a registry that resolves a connector by `SourceKind` without core code importing provider internals.
- Implement a hardened HTTP client with URL policy, redirects, timeouts, cancellation, byte limits, user agent, and sanitized logging.
- Implement public/private IP detection for IPv4 and IPv6 and re-check every redirect.
- Add explicit configuration for trusted private source URLs, defaulting to disabled.
- Implement stable connector error classes: transient, rate-limited, authentication, configuration, not-found, malformed-response, and permanent.
- Implement authenticated source list/create/read/update/delete/validate endpoints.
- Make source kind immutable after creation.
- Implement pause/resume and poll-interval bounds.
- Implement AES-256-GCM or equivalent authenticated encryption for source credentials using a versioned envelope and `APP_ENCRYPTION_KEY`.
- Ensure credential create/rotate endpoints never echo plaintext.
- Build source list and source editor UI with sanitized validation results.
- Add recent health placeholders based on source fields, even though real runs arrive in M06.
- Add audit events for source and credential changes.

## Required behavior and contracts

- A connector receives only a bounded HTTP client, validated config, decrypted credentials, clock, logger, and abort signal.
- Provider modules may not instantiate unrestricted network clients.
- Source configuration and credentials are distinct.
- Credential plaintext exists only in server memory for the minimum required scope.
- Deleting a source is soft by default; purge is deferred.
- Source validation performs at most a small bounded number of remote requests.
- Validation errors are useful but do not expose response bodies, tokens, resolved private addresses, or stack traces.

## Test requirements

- Unit-test every SSRF address class and redirect behavior.
- Unit-test timeout, byte-limit, content-type, and error-classification behavior.
- Test credential encrypt/decrypt, tamper detection, wrong key, and redaction.
- Integration-test source CRUD authorization, validation schemas, audit events, and soft deletion.
- Test that source kind cannot be changed.
- Test that credential APIs never return plaintext or ciphertext details unnecessary to clients.
- Playwright-test creating, editing, pausing, and deleting a dummy source type or disabled placeholder.

## Acceptance criteria

- [ ] The connector contract is provider-independent and documented.
- [ ] All outbound connector traffic must pass through the hardened client.
- [ ] SSRF protections cover IPv4, IPv6, redirects, and private-network defaults.
- [ ] Source CRUD and validation require administrator authentication.
- [ ] Credential material is encrypted at rest and redacted everywhere.
- [ ] Source-management UI exposes status without secrets.
- [ ] Audit events cover source and credential changes.
- [ ] No live provider connector is implemented yet.

## Out of scope

- RSS/Lemmy/Mastodon/Reddit parsing.
- Scheduled jobs.
- Feed ingestion.
- Source purge.
- Encryption-key rotation workflow beyond versioned-envelope readiness.

## Governing documents to read

- [API_CONTRACT.md](../API_CONTRACT.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)

## Implementation notes

The private-network option exists for trusted homelab feeds, but it must be explicit and visually warned. Keep separate controls for source metadata fetches and media downloads so enabling an internal RSS feed does not automatically permit arbitrary internal media access.

## Codex handoff prompt

```text
Implement only M04 — Connector SDK and Source Management.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
