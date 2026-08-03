# Changelog

All notable changes are recorded here. MirthSpool follows Semantic Versioning;
see [VERSIONING.md](VERSIONING.md).

## [Unreleased]

## [0.1.9] - 2026-08-03

### Fixed

- Replaced a stale E2E private-network label with the exact fixture source and
  media hostnames used by the release browser suite.

## [0.1.8] - 2026-08-03

### Fixed

- Scoped RSS browser-test controls to the RSS form after the iFunny source form
  introduced additional controls with the same accessible names.

## [0.1.7] - 2026-08-03

### Fixed

- Updated the closed-setup browser assertion to submit the now-required setup
  token, allowing the test to reach and verify the permanent 409 closure.

## [0.1.6] - 2026-08-03

### Fixed

- Added an explicit test-only HTTP origin escape hatch restricted to exact
  loopback hosts, allowing browser tests to exercise production-built images
  without weakening the default production HTTPS requirement.

## [0.1.5] - 2026-08-03

### Fixed

- Aligned the release acceptance public origin with the production HTTPS
  requirement while retaining direct loopback access to the test container.
- Added container status and bounded web/worker logs when release acceptance
  fails, before the isolated Compose project is removed.

## [0.1.4] - 2026-08-03

### Added

- Public iFunny `top-memes/day` ingestion with bounded HTML parsing, direct
  image/video normalization, source-management controls, and synthetic tests.

### Security

- Added one-time setup-token verification, bounded authentication JSON parsing,
  per-IP login throttling, same-origin sign-out, strict production CSP/HSTS,
  and signed trusted-proxy client-IP assertions.
- Replaced broad private-network access flags with exact host/IP/CIDR
  allowlists, redirect revalidation, IPv6 translation defenses, and fragment
  rejection at outbound-fetch boundaries.
- Hardened Docker build contexts and networking, required digest-qualified
  release images, coalesced readiness probes, and added scheduled full-history
  secret, CodeQL, dependency, and container scans.
- Resolved CodeQL HTML filtering, entity decoding, service-worker origin, and
  polynomial-time parsing findings.

## [0.1.3] - 2026-07-23

### Fixed

- Normalized GitHub owner names to lowercase before constructing container image
  references for metadata inspection, provenance, digest, and SBOM export.

## [0.1.2] - 2026-07-23

### Fixed

- Built host workspace packages before release-mode browser tests so workspace
  package exports are present on a clean GitHub Actions runner.
- Installed Playwright from the root workspace instead of filtering for a
  nonexistent end-to-end test package.
- Isolated the intentional failing feed fixture on a distinct network origin so
  connector circuit-breaker state cannot leak between serial browser scenarios.
- Pinned transitive PostCSS resolution to patched version 8.5.12 so the
  production dependency audit remains free of high-severity findings.

## [0.1.1] - 2026-07-23

### Fixed

- Kept every Compose service within the documented four-core host minimum so
  clean release acceptance can run on the supported baseline.
- Made release verification, image metadata, acceptance builds, and release
  notes follow the tagged patch version without rewriting an immutable tag.

## [0.1.0] - 2026-07-22

### Added

- Private first-run administration and authenticated sessions.
- Official RSS/Atom, Lemmy, Mastodon-compatible, and approved Reddit Data API
  connectors with bounded ingestion and synthetic tests.
- Ranked feeds, favorites, hidden items, history, deduplication, search, and
  content/source/rating filters.
- Optional bounded media cache, installable PWA, accessibility checks, metrics,
  backup/restore, retention, and incident runbooks.
- Versioned web and worker images for `linux/amd64`, embedded OCI provenance and
  SBOM attestations, downloadable SBOM JSON, and immutable digest records.

### Security

- Non-root, read-only application containers with dropped capabilities and
  explicit CPU, memory, process, network, request, and storage bounds.
- Encrypted connector credentials, same-origin mutation enforcement, SSRF
  defenses, redacted diagnostics, dependency/secret/container scans, and
  authenticated administration surfaces.

[Unreleased]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Milkman3407/Mirth-Spool/releases/tag/v0.1.0
