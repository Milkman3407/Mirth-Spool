# M19 — Recommendations and Discovery

> **Post-MVP optional milestone.** This is not required for v0.1.

**Depends on:** M17 (single-user) or M18 (multi-user)  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Add transparent, entirely local preference-based discovery using explicit user actions and source/tag affinities. Avoid external AI services and preserve deterministic fallback feed modes.

## Required deliverables

- A new explainable `for-you` feed mode.
- Local preference features derived from favorites, hides, views, source, tags, media type, and freshness.
- Cold-start and reset controls.
- Per-item explanation.
- Bias/resource/privacy safeguards.
- Offline evaluation and A/B-free operator metrics.

## Implementation tasks

- Define a small feature set using only locally stored metadata and user actions.
- Create bounded aggregates for source affinity, tag affinity, media-kind preference, favorite/hide rates, and recency.
- Avoid treating passive view time as strong positive feedback without explicit evidence.
- Define a deterministic scoring formula with configurable bounded weights.
- Blend relevance with freshness and exploration so the feed does not collapse to one source.
- Add minimum diversity rules across source/community where enough content exists.
- Implement cold-start behavior that falls back to hot/new plus source priority.
- Add `for-you` to the feed API with cursor semantics and a concise explanation of the strongest factors for each item.
- Add preference reset and recommendation disable controls.
- Ensure hidden/adult/removal rules apply before ranking.
- Compute aggregates in bounded background jobs or incremental database updates; avoid expensive per-request scans.
- Create an offline evaluation script using synthetic action histories and metrics such as duplicate rate, source concentration, freshness, and explicit-action agreement.
- Expose aggregate operational metrics without leaking personal interests.
- Document that this is heuristic ranking, not AI understanding.

## Required behavior and contracts

- No feed data or user actions leave the instance.
- No external embeddings, LLM, analytics, or tracking service.
- The user can always select new/hot/random and disable/reset recommendations.
- Every recommendation has a simple explanation.
- Hidden and content-rating policy is a hard filter, not a score.
- Diversity constraints prevent a single source from monopolizing a page when alternatives exist.
- Multi-user deployments isolate aggregates by user.
- Scoring versions are recorded so cursor behavior and migrations are explainable.

## Test requirements

- Unit-test scoring monotonicity, bounds, diversity, cold start, reset, and explanations.
- Integration-test cursor stability for a scoring version.
- Test that hidden/adult content can never be promoted past policy filters.
- Test separate users with opposite preferences when M18 exists.
- Load-test aggregate computation and for-you queries.
- Run synthetic offline evaluation and record concentration/freshness results.
- Playwright-test enable/disable/reset and explanation UI.
- Test fallback when aggregate jobs are stale or unavailable.

## Acceptance criteria

- [ ] A local explainable for-you feed works without external services.
- [ ] Cold-start and stale-aggregate fallbacks are safe.
- [ ] Users can disable and reset personalization.
- [ ] Source diversity and freshness are bounded explicitly.
- [ ] Hard content rules are never weakened by score.
- [ ] Per-item explanations are present.
- [ ] Multi-user preferences are isolated when applicable.
- [ ] Evaluation/performance evidence is documented.
- [ ] Existing deterministic feed modes remain unchanged.

## Out of scope

- Neural recommendation models.
- External AI/embedding APIs.
- Behavioral advertising or tracking.
- Emotion/face inference.
- Opaque engagement maximization.
- Automated content moderation claims.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)

## Implementation notes

Treat favorites and hides as stronger signals than passive views. Keep the first version as a documented weighted model that an administrator can understand and tune. Do not optimize solely for time spent or compulsive engagement.

## Codex handoff prompt

```text
Implement only M19 — Recommendations and Discovery.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
