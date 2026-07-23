# Changelog

All notable changes are recorded here. MirthSpool follows Semantic Versioning;
see [VERSIONING.md](VERSIONING.md).

## [Unreleased]

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

[Unreleased]: https://github.com/Milkman3407/Mirth-Spool/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Milkman3407/Mirth-Spool/releases/tag/v0.1.0
