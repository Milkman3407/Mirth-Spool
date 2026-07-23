# M00–M17 acceptance review

The release review found no silently open critical requirement across M00–M16.
The repository contains the expected workspace/CI foundation, bounded Compose
runtime, forward-only domain migrations, private authentication, connector SDK,
official RSS/Atom, Lemmy, Mastodon-compatible and Reddit ingestion, scheduler,
feed API/UI, user actions, optional media cache, deduplication/search/filtering,
PWA/accessibility work, and operations/security/recovery controls.

Known constraints are carried forward explicitly in the v0.1.0 release notes:
single-instance private deployment, operator-managed TLS, `linux/amd64` release
support, restore-based database rollback, external-key dependency for encrypted
credentials, official/public provider restrictions, privacy tradeoffs for remote
media, no manual upload, and M18/M19 deferral.

M17 remains complete only after its owner-approved license, final release-image
acceptance results, scan/SBOM review, and tag-generated immutable digest records
are present. Those items must never be inferred or silently checked off.
