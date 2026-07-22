# Content and Source Policy

## 1. Purpose

MirthSpool aggregates references to content selected by an administrator. It must preserve attribution, respect source controls, and avoid becoming an uncontrolled scraper, mirror, or open proxy.

## 2. Permitted ingestion methods

Connectors may use:

- Documented provider APIs.
- Public RSS or Atom feeds.
- Publicly documented ActivityPub-adjacent HTTP endpoints exposed for client use.
- Administrator-supplied credentials for authorized API access.

Connectors must not:

- Bypass authentication, paywalls, geo-blocks, or technical access controls.
- Evade rate limits or rotate identities to avoid provider restrictions.
- Scrape rendered HTML as a fallback unless a future milestone explicitly adds a reviewed connector and the source permits it.
- Circumvent bot protections.
- Collect private posts or direct messages.
- Impersonate another application or user.

## 3. Attribution

Every content item must retain:

- Source type and display name.
- Community/account/feed name where available.
- Original author name where provided.
- Original post URL.
- Provider publication time.
- Provider content warning/rating where available.

The primary feed card must expose an "Open original" action. Duplicate grouping must retain every known source occurrence.

## 4. Media behavior

Remote-only is the default.

When remote media is displayed directly:

- The user should understand that the browser may contact the source host.
- Referrer policy should minimize unnecessary URL leakage.
- Failed or blocked embeds should fall back to the original link.

When media is cached:

- Cache only media referenced by an accepted normalized post.
- Apply configured policy, quota, size, type, and retention limits.
- Preserve attribution.
- Do not expose cached bytes publicly without authentication.
- Provide eviction and purge controls.
- Remove cache entries when policy requires or when the corresponding content is purged.

## 5. Content rating and warnings

Use `SAFE`, `SENSITIVE`, `ADULT`, or `UNKNOWN`.

- Unknown content is not silently treated as safe.
- Provider content warnings must be preserved.
- Sensitive and adult content must be disabled or blurred by default.
- Source-level policy may reject adult content before persistence.
- The administrator can change settings explicitly.
- Search and random modes must honor the same rating rules as the main feed.

## 6. Removal and broken content

If a provider reports deletion or a media URL becomes unavailable:

- Mark the source occurrence as removed or broken.
- Do not repeatedly hammer the provider.
- Retain minimal metadata needed for favorites, history, and audit according to retention settings.
- Remove cached bytes when required by purge policy.
- Show a non-graphic placeholder and original attribution where lawful and useful.

An administrator purge action should remove local metadata and cache bytes for the selected source/content, subject to database integrity.

## 7. Duplicate content

Duplicate detection exists to improve the feed, not to erase provenance.

- Exact external IDs are deduplicated within a source.
- Cross-source duplicates may share one canonical content item.
- Keep all source occurrences.
- Prefer the best available media rendition using explicit rules.
- Allow a future administrative override when automatic grouping is wrong.

## 8. Administrator responsibility

The deployment administrator chooses sources and is responsible for compliance with local law, provider terms, and organizational policy. MirthSpool should provide safe defaults and transparent controls, but it cannot determine all jurisdiction-specific obligations.

## 9. No manual uploads in the MVP

The product must not include a file-upload endpoint, drag-and-drop uploader, or direct media-submission UI in v0.1. Importing source configuration is allowed; importing meme files is not.

## 10. Connector review checklist

Every connector pull request must document:

- Official protocol/API/feed used.
- Authentication method.
- Rate-limit behavior.
- Pagination/checkpoint behavior.
- Supported media forms.
- Content-rating mapping.
- Deletion behavior.
- Fixture provenance and sanitization.
- Known platform restrictions.
- A statement that no unsupported HTML scraping is used.
