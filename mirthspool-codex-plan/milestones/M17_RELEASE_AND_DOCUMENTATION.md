# M17 — Release and Documentation

**Depends on:** M16  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Package and publish the first reproducible MirthSpool release with complete operator/user documentation, immutable container artifacts, upgrade/rollback guidance, and a final clean-install acceptance test.

## Required deliverables

- Versioned v0.1 release artifacts.
- Production Docker images for web and worker.
- GitHub Actions release workflow.
- SBOM/provenance/signing where supported.
- Complete installation, configuration, source, operations, backup, upgrade, and troubleshooting documentation.
- Changelog and release notes.
- Fresh-install and upgrade acceptance evidence.

## Implementation tasks

- Choose and document the open-source license with project-owner approval; do not guess that all dependencies/assets are compatible.
- Add `CHANGELOG.md`, versioning policy, and release checklist.
- Build web and worker images from CI using multi-stage non-root Dockerfiles.
- Publish immutable semantic-version and commit-digest tags to the selected registry, such as GHCR.
- Generate an SBOM and attach it to release artifacts.
- Enable artifact provenance/signing when the hosting platform and workflow support it.
- Document supported architectures and test at least the primary target architecture.
- Finalize `.env.example` with every variable, safe placeholder, secret/restart annotation, and no real credentials.
- Write installation guide for a clean Linux Docker host.
- Write first-run guide and source configuration guides for RSS/Atom, Lemmy, Mastodon, and Reddit.
- Write reverse-proxy/TLS guidance without forcing one vendor.
- Write cache/storage, privacy, content-rating, backup/restore, upgrade, rollback, retention, and troubleshooting guides.
- Document remote-media privacy and source policy.
- Add screenshots only from synthetic/local fixture data and redact all tokens/hostnames not intended for publication.
- Run a clean install from only the published documentation and images.
- Run an upgrade test from the previous release candidate/schema snapshot.
- Run the full quality/security/E2E suite against release images.
- Create v0.1 release notes listing known limitations and deferred M18/M19 work.

## Required behavior and contracts

- Release artifacts are built by CI from a tagged commit.
- Image tags are immutable or accompanied by immutable digests.
- Documentation never tells users to expose PostgreSQL/Redis publicly.
- No default passwords, tokens, or encryption keys are shipped.
- Screenshots/fixtures contain no private or provider-sensitive data.
- Upgrade guidance covers database backup before migration.
- Rollback guidance is honest about forward-only migrations and restore requirements.
- The release does not claim trademark clearance, legal compliance, security certification, or accessibility certification beyond evidence.

## Test requirements

- Run every root quality gate.
- Run integration and Playwright suites against release-mode Compose images.
- Perform a clean-install test on a fresh project/volumes using docs only.
- Perform an upgrade test from the previous accepted schema/image state.
- Verify image runs as non-root and health checks pass.
- Verify SBOM generation and vulnerability scan results are reviewed.
- Verify release package/digest and changelog version match.
- Verify all Markdown links and code snippets used in critical install paths.

## Acceptance criteria

- [ ] A tagged v0.1 release can be built and reproduced through CI.
- [ ] Versioned images and immutable digests are published.
- [ ] SBOM and scan results are produced and reviewed.
- [ ] A fresh operator can install and configure the product using documentation only.
- [ ] All four connector guides explain current prerequisites and limitations.
- [ ] Backup, restore, upgrade, rollback, and incident procedures are documented.
- [ ] Clean-install and upgrade acceptance tests pass.
- [ ] Known limitations are explicit.
- [ ] M00 through M17 acceptance status is reviewed and no critical criterion is silently open.

## Out of scope

- Public hosted SaaS.
- App-store/native mobile distribution.
- Automatic domain/TLS provisioning.
- Kubernetes/Helm charts.
- M18 multi-user work.
- M19 recommendation work.

## Governing documents to read

- [README.md](../README.md)
- [PRODUCT_REQUIREMENTS.md](../PRODUCT_REQUIREMENTS.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)
- [DELIVERY_WORKFLOW.md](../DELIVERY_WORKFLOW.md)

## Implementation notes

The release milestone is a product acceptance exercise, not only a CI configuration task. Use a genuinely fresh database/Redis/cache volume for the clean-install test and record commands/results in the release pull request.

## Codex handoff prompt

```text
Implement only M17 — Release and Documentation.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
