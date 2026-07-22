# M15 — PWA, Accessibility, and Mobile Polish

**Depends on:** M14  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Turn the responsive web application into a polished installable PWA, complete the accessibility pass, and harden mobile navigation, media controls, and unreliable-network behavior without caching sensitive feeds indiscriminately.

## Required deliverables

- Web app manifest and installable PWA behavior.
- Safe service-worker caching strategy.
- Mobile navigation and one-handed controls.
- Accessibility conformance pass.
- Network/offline states.
- Share-to-original and optional native share integration.
- Cross-browser/device test coverage.

## Implementation tasks

- Add a valid web app manifest with application name, short name, start URL, display mode, theme/background metadata, and project-owned icons/placeholders generated from non-infringing assets.
- Add a service worker using a reviewed framework-compatible approach.
- Cache only the static application shell and explicitly safe public/static assets by default.
- Do not cache authenticated API responses or adult media in a general shared cache unless a future policy explicitly supports encrypted/user-scoped offline data.
- Provide a clear offline page/state and retry behavior.
- Improve bottom/top navigation for phone safe areas and screen sizes.
- Ensure feed controls have touch targets of practical size and do not rely on hover.
- Review video controls, full-screen behavior, muted defaults, and data-use behavior.
- Implement optional browser Web Share for original links with a safe fallback copy action.
- Complete semantic headings, landmarks, labels, focus order, skip navigation, live-region use, contrast, and visible focus.
- Respect reduced motion, reduced data where practical, and text zoom.
- Ensure content-warning reveal is accessible and announced.
- Test browser back/forward with filters and feed position as practical without storing excessive state.
- Create an accessibility statement describing known limitations rather than claiming unsupported certification.
- Add PWA update notification/reload behavior that does not interrupt active use.

## Required behavior and contracts

- The service worker must not create cross-user leaks on shared devices.
- Authentication/logout must invalidate or avoid sensitive cached data.
- Offline behavior must not imply that remote media is available when it is not.
- Installability cannot depend on a third-party CDN.
- All essential operations remain possible without hover, swipe, or pointer precision.
- Web Share shares the original attributed link, not a hidden cache URL.
- No upload/share-target for incoming meme files is added.

## Test requirements

- Run automated accessibility scans on setup, login, feed, content detail, sources, search, favorites, settings, and cache admin.
- Perform Playwright keyboard-only flows for primary journeys.
- Test screen-size matrix including narrow phone, large phone, tablet, and desktop.
- Test reduced motion and text zoom.
- Test installability criteria and service-worker update.
- Test offline shell and recovery after network returns.
- Test logout followed by cache inspection to ensure authenticated API data is not exposed.
- Test touch targets and content-warning controls.

## Acceptance criteria

- [ ] The application is installable as a PWA under supported browsers.
- [ ] Static-shell caching works without caching authenticated feed data by default.
- [ ] Primary journeys are keyboard and touch accessible.
- [ ] Automated accessibility checks have no unresolved critical violations.
- [ ] Reduced-motion and content-warning behavior are correct.
- [ ] Offline and update states are understandable and recoverable.
- [ ] Mobile navigation works across safe areas and tested viewports.
- [ ] Sharing uses the original attributed URL.
- [ ] No incoming upload/share target exists.

## Out of scope

- Native mobile apps.
- Encrypted offline feed/library.
- Push notifications.
- Incoming file share/upload.
- Gesture-only navigation.
- Formal third-party accessibility certification.

## Governing documents to read

- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [API_CONTRACT.md](../API_CONTRACT.md)

## Implementation notes

PWA caching is a privacy boundary, not merely a performance optimization. Default to an offline shell and freshly authenticated API access. Do not let a generic service-worker strategy cache personalized pages or media without a deliberate design.

## Codex handoff prompt

```text
Implement only M15 — PWA, Accessibility, and Mobile Polish.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
