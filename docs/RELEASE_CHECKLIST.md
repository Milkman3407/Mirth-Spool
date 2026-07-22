# Release checklist

1. Confirm all M00–M17 milestone acceptance reports are reviewed and no critical
   item is silently open.
2. Confirm the owner-approved license is present and package/image metadata
   matches it.
3. Update `package.json`, `CHANGELOG.md`, release notes, and immutable dependency
   pins; run `MIRTHSPOOL_RELEASE_TAG=vX.Y.Z pnpm release:verify`.
4. Run formatting, lint, type checks, unit, integration, source-build E2E,
   release-image E2E, build, docs, audit, secret scan, image scan,
   fresh-install, and prior-version upgrade gates.
5. Review the generated SBOMs and all HIGH/CRITICAL scan results; accepted risk
   requires an explicit documented owner decision.
6. Merge the release milestone, create the signed or protected `vX.Y.Z` tag on
   the reviewed commit, and let `.github/workflows/release.yml` build artifacts.
7. Verify both GHCR packages expose the semantic and commit-derived tags, record
   their digest references, and verify GitHub provenance attestations.
8. Download the release SBOMs/digest files and install on a clean `linux/amd64`
   host by following `docs/INSTALL.md` exactly.
9. Upgrade a preserved previous-version deployment by following
   `docs/UPGRADE.md`; verify sign-in, source validation, feed, favorite/hide/view,
   search, cache, diagnostics, backup, and restore.
10. Publish only after notes, known limitations, migration/rollback guidance,
    digest records, and SBOMs are attached.
