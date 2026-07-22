# M08 — Web Feed Experience

**Depends on:** M07  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Build the main mobile-first browsing experience over the feed API: responsive cards, infinite loading, safe media presentation, source attribution, and accessible navigation.

## Required deliverables

- A production-quality home feed.
- Mode and filter controls reflected in the URL.
- Infinite loading with robust loading/error/end states.
- Safe image, animated image, video, and link cards.
- Content-warning blur/reveal behavior.
- Content detail route or modal.
- Keyboard and touch-friendly navigation.
- Playwright coverage at phone and desktop sizes.

## Implementation tasks

- Replace the feed placeholder with a server/client composition that loads the first page efficiently.
- Implement cursor-based infinite loading with cancellation and deduplication of in-flight pages.
- Preserve mode/filter state in query parameters.
- Create accessible media cards with title, source/community, publication time, score where useful, and 'Open original'.
- Render remote raster images with lazy loading and bounded layout dimensions to prevent layout shift.
- Render animated image/video safely; videos are muted by default, use controls, and never autoplay with sound.
- Render unsupported or failed media as a link fallback without attempting active HTML embeds.
- Implement sensitive/adult blur and explicit reveal, preserving provider warnings.
- Add skeletons, retry actions, empty states, end-of-feed state, and source error hints that do not interrupt browsing.
- Implement a content detail view with alternate source attribution.
- Add keyboard shortcuts only when they do not conflict with input/accessibility behavior.
- Use IntersectionObserver or an equivalent bounded approach; avoid event-listener leaks.
- Add a reduced-motion path.
- Set safe link attributes and referrer policy.
- Ensure no upload controls or file inputs are introduced.

## Required behavior and contracts

- The first page should render without fetching all off-screen full-size media.
- Feed order and filtering come from the server API; the client must not silently re-rank.
- Card keys use stable content IDs.
- Media errors must not crash the feed.
- Sensitive/adult reveal state must not globally weaken server-side filtering.
- Original links open safely and preserve attribution.
- Infinite loading must stop when `hasMore` is false and recover from a failed page request.
- All controls need accessible names and visible focus.

## Test requirements

- Component-test media fallback, content warning, loading, and error states.
- Playwright-test first page, additional page loading, mode switching, filter URL persistence, and item detail.
- Test image/video load failure.
- Test keyboard-only operation and focus order.
- Test reduced-motion behavior.
- Run automated accessibility checks on feed and detail views.
- Test phone and desktop viewport layouts.
- Test that raw provider markup/XSS payloads render only as text.

## Acceptance criteria

- [ ] The authenticated home route is a usable infinite feed.
- [ ] New/hot/random/unseen modes can be selected.
- [ ] Filters are bookmarkable in the URL.
- [ ] Images, animated media, video, and link fallback cards behave safely.
- [ ] Content warnings and rating settings are respected.
- [ ] Attribution and original links are visible.
- [ ] Loading, empty, error, and end states are implemented.
- [ ] Keyboard/mobile/accessibility tests pass.
- [ ] There is no upload UI.

## Out of scope

- Favorites/hide actions.
- Offline feed caching.
- Swipe-to-vote gestures.
- Native mobile applications.
- Media proxy/cache.
- User comments.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)

## Implementation notes

Optimize for reliable scrolling rather than visual novelty. Avoid infinite DOM growth if it causes measurable problems; use conservative windowing only after testing because media cards and accessibility can make virtualization complex.

## Codex handoff prompt

```text
Implement only M08 — Web Feed Experience.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
