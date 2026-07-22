# M14 — Deduplication, Search, and Filters

**Depends on:** M13  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Improve discovery and feed quality with layered duplicate detection, PostgreSQL-backed full-text search, tags, and composable filters. Preserve every source occurrence and make grouping decisions explainable.

## Required deliverables

- Exact and near-duplicate detection pipeline.
- Canonical duplicate groups with provenance.
- PostgreSQL full-text search.
- Search UI and URL-addressable filters.
- Provider/category tags.
- Administrative duplicate inspection/override.
- Representative data generator and query-plan/performance evidence.

## Implementation tasks

- Implement exact duplicate candidates using normalized canonical URL, source-supplied canonical identity, and SHA-256 for cached identical bytes.
- Implement bounded perceptual hashing for safe raster images or generated small previews; isolate the hashing library behind an interface.
- Define reviewed distance thresholds and candidate narrowing to avoid O(n²) comparisons.
- Queue duplicate analysis asynchronously after content/media persistence.
- Represent grouping through `duplicateGroupId`, a duplicate-link table, or equivalent model that preserves all source posts.
- Choose the primary title/media/source using deterministic quality rules and retain alternates.
- Add an administrator view that explains duplicate reason/distance and supports split/merge override if feasible within scope.
- Implement PostgreSQL full-text search over normalized title, author, community, source display name, and tags.
- Use appropriate generated/search-vector fields and indexes.
- Define query parsing behavior, maximum length, token count, and fallback for punctuation-only queries.
- Implement `GET /api/search` and UI with cursor pagination.
- Implement filters for source, media kind, content rating, age/date, tag, favorite, hidden administrative view, and seen state as relevant.
- Encode search/filter state in the URL.
- Import provider categories/hashtags as normalized provider tags where trustworthy.
- Add optional administrator tags without adding media uploads.
- Create a deterministic representative data generator and inspect feed/search query plans.
- Document false-positive/false-negative tradeoffs.

## Required behavior and contracts

- Duplicate grouping never deletes source occurrences or attribution.
- Perceptual hashing is bounded by type, size, dimensions, time, and concurrency.
- Active/unsupported formats are not decoded through unsafe paths.
- Search uses parameterized queries and bounded input.
- Hidden/adult rules apply consistently to search and feed.
- Manual split/merge operations are authenticated and audited.
- Ranking does not count duplicate occurrences as multiple independent cards unless the administrator chooses an expanded view.

## Test requirements

- Unit-test URL normalization without merging semantically different URLs too aggressively.
- Unit-test exact hash and perceptual distance thresholds with synthetic/appropriately licensed fixtures.
- Test candidate narrowing and upper bounds.
- Integration-test duplicate grouping across RSS/Lemmy/Mastodon/Reddit occurrences.
- Integration-test primary-source/media selection and preservation of alternates.
- Integration-test search ranking, punctuation, Unicode, empty query, and filter combinations.
- Security-test oversized search/filter input and injection attempts.
- Load at least the representative dataset described in `TEST_STRATEGY.md`; capture `EXPLAIN ANALYZE` for key feed/search queries.
- Playwright-test search, filters, duplicate attribution, and administrator split/merge if implemented.

## Acceptance criteria

- [ ] Exact duplicates group reliably.
- [ ] Near-duplicate image grouping uses documented bounded thresholds.
- [ ] All source attribution remains available.
- [ ] Search covers required text fields and tags.
- [ ] Filters compose and remain bookmarkable.
- [ ] Search/feed content rules are consistent.
- [ ] Administrator can inspect why content was grouped; override is implemented or clearly deferred with safe correction path.
- [ ] Representative feed/search queries meet or reasonably approach documented targets with evidence.
- [ ] No external AI service is used.

## Out of scope

- OCR.
- Semantic/vector image search.
- Face recognition.
- Cloud AI services.
- Video perceptual hashing beyond a documented safe extension.
- Automatic content moderation claims.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)

## Implementation notes

Use layered certainty: exact external identity and cryptographic equality are strong; canonical URL and perceptual similarity are weaker and should retain an explanation. A false merge is more damaging than an occasional duplicate, so thresholds should be conservative.

## Codex handoff prompt

```text
Implement only M14 — Deduplication, Search, and Filters.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
