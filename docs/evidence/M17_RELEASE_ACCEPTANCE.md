# M17 release acceptance evidence

This record is completed from the reviewed release commit. All test identities,
source payloads, and credentials used by automated checks are synthetic.

## Source and artifact checks

- Root version/tag: `0.1.0` / `v0.1.0`.
- Supported and tested release platform: `linux/amd64`.
- Images: GHCR web and worker semantic tags plus commit-derived tags and digest
  files; exact published digests are attached by CI at tag time.
- Supply chain: BuildKit maximum provenance and SBOM attestations, GitHub build
  provenance, downloaded SPDX JSON, dependency/secret/container scans.

## Repeatable commands

Run `pnpm release:acceptance` for a clean, disposable install using locally built
release-mode images. Set `MIRTHSPOOL_ACCEPTANCE_SKIP_BUILD=true` and the two image
variables to verify published digest references. Set both
`MIRTHSPOOL_PREVIOUS_WEB_IMAGE` and `MIRTHSPOOL_PREVIOUS_WORKER_IMAGE` to add the
preserved-volume previous-image-to-current-image upgrade path. The script always
uses a dedicated Compose project and destroys only that project's test volumes.

The final completion report records exact PASS/FAIL results, scan review, and any
publication step that necessarily waits for the reviewed commit to be tagged.

## Local release-candidate result

On 2026-07-22, the clean-install path applied all ten migrations through the
bounded release migrator and reached healthy web/worker/readiness state. The
preserved-volume upgrade path started the preceding M16 local images, stopped
them, rechecked the migration history with the v0.1.0 migrator, and reached
healthy v0.1.0 web/worker/readiness state. Published-digest verification remains
a tag-time gate because the reviewed images do not exist in GHCR before release.

The five Playwright scenarios also passed against the release-mode images. Trivy
0.69.3 reported zero fixed HIGH or CRITICAL findings in both images. Reviewed
SPDX 2.3 SBOMs contained 69 packages and 133 relationships for web, and 230
packages and 246 relationships for worker. The production dependency audit had
no HIGH or CRITICAL findings; its two reported findings were MODERATE. The
repository's pinned history-aware gitleaks action remains the authoritative
secret gate; a local directory scan was also reviewed and contained only known
synthetic test/configuration values and ignored build output.
