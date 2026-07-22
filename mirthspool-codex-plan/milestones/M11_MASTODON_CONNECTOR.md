# M11 — Mastodon Connector

**Depends on:** M10  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Add media-oriented ingestion from Mastodon-compatible instances using public hashtag or public-account timelines, while preserving content warnings, attribution, alt text, and instance boundaries.

## Required deliverables

- A Mastodon connector using documented instance APIs.
- Hashtag timeline and public-account timeline modes.
- Media-only filtering and safe status normalization.
- Content-warning, sensitive flag, alt-text, and boost/reblog handling.
- Incremental pagination/checkpoint behavior.
- Fixture suite and admin source form.
- Instance capability/version diagnostics.

## Implementation tasks

- Implement against current documented Mastodon-compatible API behavior at implementation time and record tested compatibility.
- Define config for instance base URL, mode (`HASHTAG` or `ACCOUNT`), identifier, include-reblogs policy, language filter if supported, minimum media requirement, and poll limits.
- Validate hashtag syntax or resolve a public account through a bounded API call.
- Fetch timelines through the hardened HTTP client.
- Use provider pagination identifiers/links as opaque data and constrain followed links to the configured instance/API origin.
- Normalize status ID, account handle including instance, display name as plain text, status URL, publication/edit time, content warning, sensitive flag, language, counters, and media attachments.
- Prefer original media URL/preview metadata supplied by the API; do not render provider HTML.
- Preserve media descriptions as alt text.
- Handle image, GIFV/video, and unsupported attachment types safely.
- Define reblog/boost behavior: either represent the original status occurrence once or preserve boost attribution without duplicate feed spam; document the rule.
- Strip/sanitize status HTML to plain text for optional title/summary without allowing active markup.
- Map provider `sensitive` and non-empty spoiler text conservatively.
- Classify instance auth/visibility/rate-limit/deletion/malformed errors.
- Add source UI and preview showing resolved hashtag/account and instance.

## Required behavior and contracts

- Use public documented APIs; do not scrape profile or hashtag HTML.
- Do not ingest private, followers-only, or direct statuses.
- Remote instance and account identity are part of attribution.
- Pagination links cannot redirect the connector to another arbitrary host.
- Provider HTML content is sanitized to plain text and never inserted as raw HTML.
- Reblogs must not cause uncontrolled duplicates.
- Content warning and sensitive flags affect feed rendering and filtering.

## Test requirements

- Fixture-test hashtag media, account media, multiple attachments, GIFV/video, alt text, spoiler text, sensitive flag, edited/deleted status, reblog, pagination, rate limit, and malformed HTML.
- Test account handles with local and remote-style forms as supported by resolution.
- Test that pagination URLs outside the configured instance are rejected.
- Test XSS payloads in display name/status HTML/alt text.
- Integration-test source validation and scheduled ingestion with a local mock instance.
- Playwright-test adding a Mastodon source and content-warning behavior.
- Verify no live-network dependency in CI.

## Acceptance criteria

- [ ] Hashtag and public-account sources validate and poll.
- [ ] Only public statuses are ingested.
- [ ] Media, alt text, content warnings, and sensitive state normalize correctly.
- [ ] Instance-aware attribution is visible.
- [ ] Reblog behavior is documented and avoids feed spam.
- [ ] Pagination is bounded and origin-restricted.
- [ ] Raw provider HTML never reaches the rendering layer.
- [ ] Fixtures cover required cases.

## Out of scope

- Posting, boosting, favoriting, or following through MirthSpool.
- Private/authenticated home timelines.
- Full ActivityPub server federation.
- Audio-first content.
- Generic Fediverse HTML scraping.

## Governing documents to read

- [API_CONTRACT.md](../API_CONTRACT.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DATA_MODEL.md](../DATA_MODEL.md)

## Implementation notes

Mastodon-compatible servers may differ. Capability detection should be conservative and diagnostic; do not create a permissive parser that silently accepts incompatible payloads. Keep the connector useful with public endpoints before considering optional authentication.

## Codex handoff prompt

```text
Implement only M11 — Mastodon Connector.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
