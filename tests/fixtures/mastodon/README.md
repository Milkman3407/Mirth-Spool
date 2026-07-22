# Mastodon connector fixtures

These responses are synthetic and were authored for MirthSpool from the official
Mastodon client API entity shapes current on 2026-07-22. They contain no access
tokens, cookies, private statuses, live account identifiers, or copied posts.

The set covers instance diagnostics, hashtag and account resolution, images,
multiple attachments, GIFV/video, unsupported audio, alt text, spoiler and
sensitive flags, edited/deleted statuses, boosts, visibility filtering,
pagination movement, provider errors, malformed JSON, and XSS-shaped text.

Tests mock the hardened HTTP boundary or use the local fixture container. CI does
not contact a live instance and no profile, hashtag, or status HTML is scraped.
