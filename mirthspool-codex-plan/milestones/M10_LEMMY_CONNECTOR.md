# M10 — Lemmy Connector

**Depends on:** M09  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Add Lemmy community ingestion through documented instance APIs, including pagination, media/link extraction, sensitive-content mapping, and provider-aware rate behavior.

## Required deliverables

- A Lemmy connector behind the common connector interface.
- Configuration for instance URL, community, sort, minimum score, and content policy.
- Connectivity validation with community preview.
- Pagination/checkpoint behavior suitable for scheduled incremental polling.
- Media and post normalization.
- Sanitized fixture suite and source-form support.
- Operational documentation for instance-specific limitations.

## Implementation tasks

- Research and implement against the current documented Lemmy client API at implementation time; record the API version/compatibility assumptions.
- Define a validated config schema for instance base URL, community name or identifier, sort mode, minimum score, and optional page/run limits within global bounds.
- Resolve/validate the requested community without following arbitrary links.
- Fetch posts through the hardened HTTP client and connector context.
- Normalize post ID, title, creator, community, canonical/original URL, provider score, comments count, publication/update times, NSFW flag, body warning hints, and media.
- Handle direct image/video links, provider thumbnails, and external link posts without scraping destination pages.
- Map Lemmy NSFW metadata to `ADULT` or configured policy; map missing/uncertain state conservatively.
- Implement incremental polling that tolerates new posts appearing between pages and remains idempotent through external IDs.
- Preserve instance hostname in attribution so identically named communities on different instances are distinct.
- Classify not-found/private/banned/auth/rate-limit/malformed responses into shared errors.
- Add an admin source form and connectivity result that identifies the resolved community.
- Add fixture provenance notes and sanitize all account data.
- Update source documentation with instance rate limits and federation caveats.

## Required behavior and contracts

- Use the instance API; do not scrape Lemmy HTML.
- Public community access is the MVP path. Optional tokens may be supported only if required and stored through encrypted credentials.
- An external link is not automatically treated as safe inline media.
- Cross-instance duplicate posts retain separate source occurrences.
- Connector pagination/checkpoints must not assume globally monotonic IDs across instances.
- Instance base URLs pass the same SSRF and redirect policy as every source.
- Provider content deletion must update the source occurrence without erasing unrelated occurrences.

## Test requirements

- Fixture-test image post, video/link post, text-only fallback, NSFW post, deleted post, missing community, pagination, rate limit, and malformed response.
- Test identical community names on different instance hosts.
- Test new-item insertion between pages without duplicate persistence.
- Test source validation and sanitized errors with a local mock server.
- Integration-test scheduled ingestion, checkpoint updates, and source health.
- Playwright-test adding a Lemmy source and seeing normalized content in the feed.
- Verify no live-network dependency in CI.

## Acceptance criteria

- [ ] A valid public Lemmy community can be configured and polled.
- [ ] Posts normalize into existing content/media models.
- [ ] Attribution includes instance and community.
- [ ] NSFW/content-warning mapping follows product policy.
- [ ] Pagination is idempotent under changing result sets.
- [ ] Provider errors map to correct source health states.
- [ ] Fixtures cover required success and failure cases.
- [ ] No HTML scraping or arbitrary destination fetch occurs.

## Out of scope

- Lemmy login, voting, commenting, posting, or private communities.
- Running a federated Lemmy server.
- Following outbound links to extract media.
- Platform-specific UI outside shared attribution.

## Governing documents to read

- [API_CONTRACT.md](../API_CONTRACT.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DATA_MODEL.md](../DATA_MODEL.md)

## Implementation notes

Provider APIs evolve. Keep response parsing narrow and validated, isolate version-specific fields, and fail with `MALFORMED_PROVIDER_RESPONSE` rather than accepting unknown shapes. Record current API assumptions in connector documentation without hard-coding a single instance's behavior.

## Codex handoff prompt

```text
Implement only M10 — Lemmy Connector.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
