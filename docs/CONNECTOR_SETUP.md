# Connector setup guides

All sources are administrator-selected, use official APIs, public feeds, or a
reviewed public page, and remain subject to global request, response-byte, item,
page, duration, retry, port, and SSRF limits. Validate before enabling. Never
put credentials in a URL, source JSON, screenshots, or logs. Detailed protocol
and rating mappings are in [the connector security boundary](CONNECTORS.md).

## RSS and Atom

Prerequisites: an HTTP(S) RSS 2.0 or Atom feed URL that is publicly reachable by
the server and permits automated feed retrieval. Add an RSS source with the feed
URL, item/page bound, polling interval of 60–86,400 seconds, and explicit content
policy. No authentication, linked-page scraping, or media download occurs during
ingestion. Conditional `ETag`/`Last-Modified` polling is supported; ambiguous
ratings remain `UNKNOWN`. Private addresses are rejected unless the operator
enables the narrow homelab exception.

## Lemmy

Prerequisites: a compatible public Lemmy 0.19 instance/API v3 and a community
name or numeric ID visible from that configured instance. Add a Lemmy source with
one instance origin, community, sort, minimum score, content policy, 1–50 items
per page, and 1–10 pages per run. No account token is used. Federation delay,
instance moderation, and API v4 incompatibility can change results; MirthSpool
does not fall back to HTML or query a second instance automatically.

## Mastodon-compatible

Prerequisites: a Mastodon 4.x-compatible server with public preview enabled and
either a public hashtag or public account. Add the instance origin, `HASHTAG` or
`ACCOUNT` mode, target, optional language, boost policy, attachment minimum,
1–40 statuses per page, and 1–10 pages per run. No token is used. Only explicitly
public statuses are accepted; unlisted/private/direct posts and incompatible API
shapes are discarded or fail closed. The connector never follows arbitrary
pagination origins or scrapes rendered pages.

## Reddit Data API

Prerequisites: an operator-registered confidential OAuth client and Reddit
approval for the intended use. Re-check Reddit's current Data API terms before
enabling; installation does not grant access. Store the client ID, client secret,
and descriptive required User-Agent through the encrypted credential endpoint,
not general configuration. Add subreddit, sort/time window, score/sticky/rating
policy, 1–100 posts per page, and 1–10 pages per run. MirthSpool requests only
app-only `read` access and honors response rate-limit headers. It does not access
private/quarantined communities, vote, comment, submit, impersonate a user,
bypass gates, or scrape HTML. Operators remain responsible for deletion and
retention obligations.

## iFunny top memes of the day

No account or credential is required. Add the fixed public
`https://ifunny.co/top-memes/day` collection, choose a 1–50 item bound, set a
rating fallback, and normally poll no more than hourly. The connector makes one
HTML request, accepts stable `data-meme-id` and `data-meme-link` attributes, and
normalizes only HTTPS media hosted by `img.getfn.io`. It does not open individual
posts, execute page scripts, access comments, or send user data. Because this is
a public-page integration rather than a documented API, an iFunny markup or
access-policy change will fail validation closed until the connector is reviewed.

After validation, enable one source at a time, trigger one manual refresh, and
review sanitized health, rating, attribution, and rate-limit results before
shortening its schedule. A failing source must stay isolated from other sources.
