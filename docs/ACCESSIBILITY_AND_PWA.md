# Accessibility and PWA support

MirthSpool aims to make its primary journeys usable with a keyboard, touch,
screen readers, text zoom, and reduced-motion preferences. This is an ongoing
engineering commitment, not a claim of formal WCAG certification.

## Current support

- Semantic landmarks, headings, labels, skip navigation, visible focus, and
  polite status announcements are included in the setup, authentication, feed,
  detail, source, search, library, settings, and cache-management journeys.
- Phone navigation accounts for display safe areas and provides essential
  destinations without requiring hover, swipe, or precise pointer input.
- Restricted-content controls expose their state and announce reveal/hide
  changes. Videos start muted, retain native controls, support inline playback,
  and do not preload media by default.
- The web app manifest and project-owned icons allow installation without a
  third-party asset host. The service worker caches only the offline shell and
  same-origin framework static files. It deliberately does not cache pages,
  authenticated APIs, feed/library data, or media.
- When offline, MirthSpool explains that authenticated data and remote media are
  unavailable and provides a retry path. Updates are offered without forcing a
  reload during active work.

## Known limitations

- Accessibility varies with upstream media. Provider captions, alternative
  text, and content warnings may be incomplete.
- Native video controls, Web Share, install prompts, and offline capabilities
  differ by browser and operating system. Copying an original link remains the
  sharing fallback.
- No authenticated feed or library content is available offline. This is an
  intentional privacy boundary for shared devices.
- Very long provider-generated text or unusually large user font settings may
  make individual cards taller, although controls remain available without
  horizontal page scrolling in tested layouts.

Report an accessibility problem through the project's normal issue tracker.
Include the page, browser, assistive technology, and steps to reproduce, but do
not include private feed content, credentials, or session data.
