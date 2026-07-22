# M07 — Feed API and Ranking

**Depends on:** M06  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Expose normalized content through authenticated, cursor-paginated feed APIs with transparent new, hot, random, and unseen ordering. Establish query performance and pagination correctness before building the full feed UI.

## Required deliverables

- Authenticated feed and content-detail APIs.
- Stable cursor implementation.
- New, hot, random, and unseen modes.
- Composable source/media/rating/date/tag filters.
- A documented transparent hot-ranking formula.
- Deterministic seeded random pagination.
- Feed-query integration and performance tests.

## Implementation tasks

- Implement `GET /api/feed` and `GET /api/content/:id` according to `API_CONTRACT.md`.
- Create signed/tamper-resistant cursor encoding with versioning.
- Implement keyset pagination for `new` using publication time plus stable ID tie-breaker.
- Implement `hot` using a transparent formula based on provider score, source priority, age decay, and bounded freshness; avoid per-request full-table recalculation.
- Document the exact formula and units in code/docs.
- Implement deterministic `random` ordering from a client/server seed without duplicates across pages; use a scalable hash/order strategy.
- Implement `unseen` based on absence of a view action while preserving cursor stability.
- Apply hidden/content-status/content-rating exclusions consistently.
- Support validated filters and bounded page sizes.
- Select a primary source occurrence and media rendition using deterministic rules.
- Return alternate source count and original attribution.
- Return a small ranking explanation for hot items.
- Add indexes or cached ranking fields needed for representative performance.
- Add request IDs, latency logging, and stable error responses.

## Required behavior and contracts

- All feed modes require authentication.
- Cursors bind to mode/filter state and reject incompatible or tampered reuse.
- Pagination must not repeat or skip stable rows under normal insertion patterns; document unavoidable behavior with newly arriving content.
- Random order must be stable for a seed and finite result set.
- Unknown/adult content obeys current settings.
- Hidden and removed/broken items are excluded unless an explicit administrative view requests them.
- Feed responses never include encrypted credentials or raw provider payloads.
- Limits are capped server-side even if the client asks for more.

## Test requirements

- Unit-test cursor signing, versioning, expiration if used, and tamper rejection.
- Unit-test hot-ranking boundaries and deterministic explanation.
- Integration-test each mode with equal timestamps/scores and multiple pages.
- Integration-test random stability and no duplicates for a fixed seed.
- Integration-test filter combinations and rating enforcement.
- Integration-test unseen mode before and after view actions.
- Load representative generated data and record query plans/latency.
- Test unauthenticated and unauthorized access.

## Acceptance criteria

- [ ] Feed API supports new, hot, random, and unseen modes.
- [ ] All modes use bounded cursor pagination.
- [ ] Hot ranking is documented and explainable.
- [ ] Random mode is deterministic for a seed and does not duplicate items across pages.
- [ ] Filters and content-rating rules are enforced server-side.
- [ ] Feed details preserve source attribution.
- [ ] Representative query plans use intended indexes.
- [ ] API tests cover authentication, cursor tampering, and edge cases.

## Out of scope

- Infinite-scroll UI.
- Favorite/hide UI behavior beyond data already seeded.
- Full-text search.
- Perceptual duplicate grouping.
- Machine-learning recommendations.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)

## Implementation notes

Keep ranking deliberately simple in v0.1. A suitable starting form is a normalized provider signal plus source priority minus an age-decay term. Provider scores from different platforms are not directly comparable, so bound/transform them rather than treating raw scores as universal.

## Codex handoff prompt

```text
Implement only M07 — Feed API and Ranking.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
