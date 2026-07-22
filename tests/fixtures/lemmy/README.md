# Lemmy connector fixtures

These responses are synthetic and were authored for MirthSpool. Their shape is
based on the official Lemmy 0.19 `lemmy-js-client` API v3 types current on
2026-07-22. They contain no account tokens, cookies, private posts, live user
identifiers, or copied community content.

`community.json` represents a public community preview. `posts-page-1.json`
covers image, video/external-link, text-only, NSFW, and removed posts.
`posts-page-2.json` deliberately repeats one external ID and introduces a new
post to model insertion between mutable page-number requests.

The connector tests mock the hardened HTTP boundary. CI never contacts a live
Lemmy instance and no unsupported HTML scraping is used.
