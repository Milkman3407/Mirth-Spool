# M12 — Reddit Connector

**Depends on:** M11  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Add subreddit ingestion through Reddit's current official API and OAuth requirements, with explicit credential handling, user-agent identification, rate-limit compliance, and support for common image/gallery/video post forms.

## Required deliverables

- An OAuth-based Reddit connector using official documented APIs.
- Secure Reddit credential configuration and token caching.
- Subreddit source configuration and validation.
- Normalization for images, galleries, hosted video, GIF-like video, and link fallback.
- Rate-limit-aware pagination and retries.
- Fixture suite and administrator documentation.
- A clear compatibility/policy note based on the API rules current at implementation time.

## Implementation tasks

- Review Reddit's current official developer/API documentation and access terms at implementation time; record the selected OAuth flow, required app type, scopes, and rate behavior in connector docs.
- Define server-only deployment/source credentials such as client ID, client secret where applicable, and a descriptive user agent.
- Store source-specific secrets through the encrypted credential boundary or use validated environment references; never place them in source config or client responses.
- Implement access-token acquisition and cache tokens in Redis using expiry metadata; protect refresh/acquisition from stampedes.
- Define config for subreddit, sort mode suitable for ingestion, time window where applicable, minimum score, include-stickied policy, and content rating.
- Validate subreddit existence/access through a bounded API request.
- Fetch listings through the hardened HTTP client and official OAuth endpoint.
- Normalize post ID, title, author, subreddit, permalink/original URL, created time, score, comments, over-18 flag, spoiler flag, removal state, and media.
- Support direct images, preview images when appropriate, multi-image galleries, Reddit-hosted video/DASH/HLS metadata only when safely renderable, animated formats, and link fallback.
- Do not follow arbitrary linked websites to extract media.
- Handle crossposts deterministically and preserve attribution without duplicate storms.
- Honor provider rate headers and `Retry-After`; stop before exhausting limits when practical.
- Use descriptive, configurable but validated user-agent identification.
- Classify private/banned/not-found/auth/rate-limit/quarantined/malformed responses.
- Add a Reddit source form and a credential-health indication that never reveals secrets.

## Required behavior and contracts

- Use the official API only; no old-Reddit/new-Reddit HTML scraping.
- Credentials and access tokens remain server-side and are redacted.
- The implementation must follow the API rules current when coded; do not assume historic free-tier limits or endpoint behavior.
- Adult/quarantined content is not bypassed; source access and product policy both apply.
- Crossposts and galleries retain stable IDs and source attribution.
- Rate-limit state influences scheduling and retry behavior.
- The connector does not vote, comment, post, subscribe, or impersonate a user.

## Test requirements

- Fixture-test direct image, gallery, hosted video metadata, link post, crosspost, NSFW/spoiler, stickied, removed/deleted, private/not-found subreddit, pagination, token expiry, rate limit, and malformed response.
- Test token cache hit, expiry, refresh, and stampede prevention.
- Test credential redaction in errors/logs/API responses.
- Test minimum-score and stickied filters.
- Integration-test source validation and ingestion using mocked OAuth/API servers.
- Playwright-test credential/source setup using the mock environment and feed rendering.
- Verify CI does not require real Reddit credentials or network access.

## Acceptance criteria

- [ ] A valid configured subreddit can be validated and polled through official APIs.
- [ ] OAuth credentials/tokens are encrypted or server-only and never exposed.
- [ ] Rate-limit behavior is compliant and tested.
- [ ] Supported images, galleries, and videos normalize correctly.
- [ ] Crossposts do not create uncontrolled duplicate cards.
- [ ] NSFW/spoiler/removal state maps correctly.
- [ ] No destination-page or Reddit HTML scraping occurs.
- [ ] Current API assumptions and administrator setup are documented.

## Out of scope

- Reddit voting, commenting, posting, messaging, or account browsing.
- Bypassing private/quarantined/community access controls.
- Scraping Reddit web pages.
- Downloading every video rendition.
- Automated credential creation.

## Governing documents to read

- [API_CONTRACT.md](../API_CONTRACT.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)

## Implementation notes

This connector is intentionally late because provider authentication and policy are more operationally sensitive than open feeds. If current official access requirements make a particular mode unavailable, implement the documented supported mode, leave unsupported criteria unchecked, and explain the limitation rather than adding a scraper.

## Codex handoff prompt

```text
Implement only M12 — Reddit Connector.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
