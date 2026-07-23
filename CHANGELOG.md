# Changelog

All notable changes are recorded here. MirthSpool follows Semantic Versioning;
see [VERSIONING.md](VERSIONING.md).

## [Unreleased]

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

[Unreleased]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Milkman3407/Mirth-Spool/releases/tag/v0.1.0
