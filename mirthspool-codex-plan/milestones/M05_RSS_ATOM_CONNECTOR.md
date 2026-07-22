# M05 — RSS/Atom Connector

**Depends on:** M04  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Implement the first production connector using RSS and Atom. This establishes fixture, pagination/checkpoint, media extraction, and source-validation patterns that later connectors must follow.

## Required deliverables

- RSS 2.0 and Atom parsing through the common connector interface.
- Feed connectivity validation and metadata preview.
- Conditional requests using ETag and Last-Modified when available.
- Safe extraction of image, animated image, video, and link fallback assets.
- Deterministic sanitized fixtures and connector tests.
- An RSS/Atom source form in the admin UI.

## Implementation tasks

- Define RSS/Atom connector config containing feed URL and optional feed-specific limits.
- Fetch through the hardened HTTP client only.
- Parse RSS and Atom using a maintained XML/feed parser configured to reject unsafe XML features.
- Map stable entry IDs using GUID/ID, then canonical link, then a deterministic fallback hash.
- Extract media from standard enclosures and common Media RSS elements.
- Allow tightly bounded parsing of entry HTML only to find media URLs/text; sanitize and never render raw HTML.
- Resolve relative URLs against the feed/entry base URL safely.
- Preserve title, author, published/updated time, categories, content warning hints, original link, and media metadata.
- Represent unsupported entries as link cards only when they still have a valid original URL.
- Implement ETag/Last-Modified checkpoint metadata and correct `304 Not Modified` handling.
- Bound entries per fetch and reject unexpectedly large XML.
- Map obvious adult/sensitive feed metadata where present; default uncertain items to `UNKNOWN` rather than `SAFE`.
- Add a source configuration UI with feed URL, display name, interval, priority, rating policy, and enabled state.
- Record connector-specific validation summary such as feed title and sample item count.

## Required behavior and contracts

- No generic webpage scraping follows entry links.
- XML external entities and dangerous parser features are disabled.
- Media URLs remain untrusted and are not server-fetched merely because they appear in a feed.
- Conditional-request state is a checkpoint and must not advance on failed parsing/persistence.
- The connector returns normalized data and never writes directly to the database.
- Entry identifiers are deterministic across repeated fetches.

## Test requirements

- Fixture-test RSS 2.0, Atom, Media RSS, enclosures, relative URLs, missing IDs, malformed dates, empty feeds, and malformed XML.
- Test XML entity/billion-laughs style rejection with a small synthetic fixture.
- Test ETag/Last-Modified and `304` behavior.
- Test duplicate entry IDs and deterministic fallback IDs.
- Test adult/unknown rating mapping.
- Test oversized response and timeout behavior at the HTTP-client boundary.
- Integration-test source validation with a local controlled fixture server; no public internet dependency.

## Acceptance criteria

- [ ] RSS and Atom feeds validate and normalize through the shared connector interface.
- [ ] Repeated fetches produce stable external IDs.
- [ ] Conditional requests work and do not create false failures.
- [ ] Media extraction handles standard safe cases without arbitrary page scraping.
- [ ] Dangerous XML and oversized inputs are rejected safely.
- [ ] Fixtures cover success and provider/error edge cases.
- [ ] The source UI can create and validate an RSS/Atom source.

## Out of scope

- Scheduled polling.
- Database ingestion of connector results.
- JavaScript-rendered or HTML-only websites.
- Full article extraction.
- Media downloading/caching.
- OCR or semantic analysis.

## Governing documents to read

- [API_CONTRACT.md](../API_CONTRACT.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DATA_MODEL.md](../DATA_MODEL.md)

## Implementation notes

Favor standards-based enclosure extraction. Common extensions may be supported when fixtures document behavior, but the connector should remain a feed parser rather than evolve into a general scraper.

## Codex handoff prompt

```text
Implement only M05 — RSS/Atom Connector.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
