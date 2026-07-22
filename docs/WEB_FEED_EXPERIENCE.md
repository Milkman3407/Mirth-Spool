# Web feed experience

M08 renders the first authenticated feed page on the server and then loads bounded cursor pages in the browser. Feed ordering and filtering remain authoritative in `GET /api/feed`; the browser never re-ranks items.

## Navigation and filters

- Newest, hot, random, and unseen modes are represented by the `mode` query parameter.
- Source, media type, maximum rating, UTC date range, tag, and unseen-history controls are encoded in the URL so a filtered feed can be bookmarked.
- A mode or filter change starts a fresh cursor chain. Random mode keeps the server-issued seed for subsequent pages.
- The first page and every additional page are limited to 12 items. A single in-flight request is allowed, duplicate content IDs are ignored defensively, and loading stops when the API reports `hasMore: false`.

## Remote media and privacy

Remote-only media is displayed from normalized HTTP(S) provider URLs. The user's browser therefore contacts the media host and reveals the browser's network address to that host. MirthSpool sends no referrer, adds no analytics or tracking, and does not proxy arbitrary URLs.

Static and animated raster images use lazy loading and bounded intrinsic dimensions. Videos use metadata preload, native controls, inline playback, and muted-by-default behavior; they never autoplay with sound. Link-only, malformed, unsupported, and failed media use an attributed original-link fallback. No provider HTML, SVG, iframe, or active embed is rendered.

Sensitive, adult, unknown, and provider-warning items are guarded per card. Revealing a card is local presentation state and does not change the server-side rating ceiling or feed query.

## Accessibility and failure behavior

The experience uses semantic headings, articles, forms, links, native media controls, visible focus styles, and a manual load-more control alongside intersection-based loading. Loading, empty, recoverable-error, and end states are announced. Reduced-motion preferences disable the loading animation and transitions.

The content-detail route shows every retained source occurrence and safe original link. Feed and detail views remain authenticated, and neither view includes an upload control.
