# M09 — User Actions and Library

**Depends on:** M08  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Add idempotent favorite, hide, unhide, and view behavior together with favorites, hidden-item management, and optional history views. Feed state should update quickly without sacrificing server correctness.

## Required deliverables

- User-action APIs.
- Favorite/hide/view controls on cards and detail views.
- Favorites library.
- Hidden-items management with restore.
- Configurable view-history behavior and history page.
- Optimistic UI with rollback on failure.
- Action-state integration in all feed modes.

## Implementation tasks

- Implement idempotent action routes from `API_CONTRACT.md`.
- Decide and document whether `VIEW` stores first/last timestamps and count in one row or uses a dedicated view-state model.
- Record a view only after a meaningful visibility threshold or explicit navigation, not merely because an item exists in initial HTML.
- Add favorite/hide controls with accessible labels and server-confirmed state.
- Use optimistic updates with clear rollback/toast behavior on failure.
- Remove hidden content from the active feed immediately while retaining undo.
- Create favorites, hidden, and history routes with cursor pagination.
- Allow unhide and unfavorite from management views.
- Add a setting to disable detailed view history; define resulting unseen behavior.
- Update feed API joins/queries so action state is efficient and user-scoped.
- Add audit events only for administrative policy changes, not every personal favorite/view.
- Add bulk clear-history or clear-hidden only if it is transactionally bounded and explicitly confirmed.

## Required behavior and contracts

- Actions are unique per user/content/kind and idempotent.
- Hidden content is excluded from normal feed/search by default.
- Favorites remain accessible if an upstream source occurrence later breaks, subject to local retention.
- View recording does not generate excessive writes during rapid scrolling.
- History settings are private and do not affect source ingestion.
- Every action API authorizes against the current session; no user ID is trusted from the client.
- Optimistic UI never becomes the durable source of truth.

## Test requirements

- Integration-test repeated/concurrent favorite, hide, unhide, and view requests.
- Integration-test feed exclusion and restoration of hidden items.
- Integration-test favorites/history pagination.
- Test unseen mode before/after meaningful view recording.
- Test history-disabled behavior.
- Playwright-test favorite, hide with undo, hidden management, and cross-refresh persistence.
- Test optimistic rollback on simulated server failure.
- Test that one user cannot address another user in preparation for future multi-user support.

## Acceptance criteria

- [ ] Favorite, hide, unhide, and view operations are idempotent.
- [ ] Feed cards and detail views show accurate action state.
- [ ] Favorites and hidden management views work across page reloads.
- [ ] Hidden content is excluded by default and can be restored.
- [ ] View-history behavior is documented and configurable.
- [ ] Unseen mode reflects meaningful view state.
- [ ] Action APIs never trust client-supplied user identity.
- [ ] End-to-end persistence and failure tests pass.

## Out of scope

- Comments, reactions beyond favorite/hide, or public vote counts.
- Social sharing inside MirthSpool.
- Multiple users.
- Recommendation model.
- Export/import of personal libraries.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)

## Implementation notes

A practical view policy is to mark an item viewed after it has been at least 50% visible for a short threshold, with client-side batching to reduce writes. The exact threshold must be documented and testable with a direct API fallback.

## Codex handoff prompt

```text
Implement only M09 — User Actions and Library.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
