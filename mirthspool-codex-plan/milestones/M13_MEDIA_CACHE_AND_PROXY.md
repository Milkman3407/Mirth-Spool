# M13 — Media Cache and Proxy

**Depends on:** M12  
**Target:** One focused pull request  
**Status:** Planned

## Objective

Add an optional, authenticated, bounded media cache with local-filesystem and storage-adapter boundaries. Keep remote-only mode as the default and ensure no endpoint can be abused as an open proxy.

## Required deliverables

- Storage adapter interface with local filesystem implementation.
- Cache policies: none, favorites-only, TTL, and all-within-quota.
- Media fetch, validation, persistence, access, eviction, and purge jobs.
- Authenticated internal-ID media route.
- Quota/health administration UI.
- Range/conditional delivery where appropriate.
- Comprehensive SSRF, MIME, size, and path-safety tests.

## Implementation tasks

- Define a storage adapter for put/get/stat/delete/list-by-prefix or equivalent bounded operations.
- Implement local storage under a configured directory using generated opaque keys.
- Keep an S3-compatible adapter interface documented; implementation may be included only if it stays within scope and is tested.
- Add validated cache policy, total quota, per-object size, TTL, media-kind allowlist, and concurrency settings.
- Create cache jobs only for media records already associated with accepted content.
- Resolve the remote URL from the database by media ID; job payloads must not contain arbitrary fetch URLs from clients.
- Fetch through the hardened media HTTP policy with DNS/redirect revalidation and separate private-network control.
- Stream to a temporary file/object while enforcing compressed/decompressed byte limits, timeouts, and cancellation.
- Verify magic bytes and supported MIME; reject active HTML and SVG inline rendering.
- Calculate SHA-256 while streaming and persist byte length, MIME, storage key, and cache state transactionally.
- Use atomic rename/commit semantics so partial files are never served.
- Implement `/api/media/:mediaId` with authentication, safe headers, conditional requests, and range support for cached video where practical.
- Never accept a URL parameter on the media-serving route.
- Implement LRU/expiry/favorites-aware eviction to remain within quota.
- Update `lastAccessedAt` without creating excessive write amplification.
- Add cache use, failures, queued count, and eviction controls to admin UI.
- Implement purge that deletes bytes and updates metadata safely.
- Document privacy tradeoffs between direct remote loading and server caching.

## Required behavior and contracts

- Remote-only remains the default after upgrade.
- The cache route uses internal media IDs only and requires authentication.
- No redirect, source, or media URL can make the service fetch unrestricted network locations.
- Cached bytes are never trusted based only on extension or provider header.
- Temporary/partial files are not visible to clients.
- Quota enforcement works under concurrent downloads.
- Eviction never deletes favorited content under favorites-only policy unless explicitly purged or quota rules are documented to do so.
- Storage errors do not corrupt content records or stop remote-only feed use.

## Test requirements

- Unit-test cache-policy decisions and eviction ordering.
- Security-test public-to-private redirect, DNS/IP classes, unsupported ports, oversized body, slow stream, incorrect MIME, disguised HTML/SVG, decompression bomb proxy, and path traversal.
- Integration-test concurrent cache requests for the same media and verify one durable object.
- Integration-test crash/abort leaving no served partial file.
- Integration-test quota enforcement and eviction.
- Test auth and content-rating enforcement on media route.
- Test conditional/range responses for representative image/video assets.
- Playwright-test enabling favorites-only cache, favoriting content, and observing cached status using a local fixture server.

## Acceptance criteria

- [ ] Cache policy is disabled by default and explicitly configurable.
- [ ] Local storage adapter safely writes and serves verified media.
- [ ] The media route cannot be used as an open proxy.
- [ ] Authentication, content policy, and safe headers are enforced.
- [ ] Quota and eviction remain correct under concurrency.
- [ ] Partial/malformed/unsupported media is rejected and cleaned up.
- [ ] Cache status and usage are visible to the administrator.
- [ ] Purge removes bytes and updates database state.
- [ ] Security regression suite passes.

## Out of scope

- Public CDN behavior.
- Unauthenticated share links.
- Transcoding arbitrary video.
- SVG sanitization/rendering.
- Permanent mirroring without quota.
- Browser upload.
- Image editing or meme generation.

## Governing documents to read

- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [API_CONTRACT.md](../API_CONTRACT.md)
- [CONTENT_AND_SOURCE_POLICY.md](../CONTENT_AND_SOURCE_POLICY.md)
- [SECURITY_AND_PRIVACY.md](../SECURITY_AND_PRIVACY.md)
- [DATA_MODEL.md](../DATA_MODEL.md)
- [TEST_STRATEGY.md](../TEST_STRATEGY.md)

## Implementation notes

Keep source fetching and media fetching as separate policy contexts. A homelab administrator may allow an internal RSS feed but should not automatically permit media URLs from that feed to probe every private address.

## Codex handoff prompt

```text
Implement only M13 — Media Cache and Proxy.

Read AGENTS.md and every governing document listed in this milestone before editing.
Inspect the repository and run the existing quality gates first.
Keep the change limited to this milestone.
Do not begin later milestones and do not add manual meme-upload functionality.
Preserve security, attribution, idempotency, and resource limits.
Run all tests required by this milestone.
Finish with the exact milestone completion report required by AGENTS.md.
```
