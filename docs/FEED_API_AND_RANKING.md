# Feed API and ranking

MirthSpool exposes authenticated `GET /api/feed`, `GET /api/content/:contentId`, and `GET /api/content/:contentId/sources`. Feed pages are capped at 50 items and use signed, versioned HMAC-SHA256 cursors. A cursor binds the ordering mode and canonical filter state; modification or reuse with different filters returns `INVALID_CURSOR`. Cursors do not expire in v0.1.

## Ordering

- `new` and `unseen`: `publishedAt DESC, id DESC`. Unseen additionally excludes the current user's `VIEW` actions.
- `hot`: `rankingScore DESC, publishedAt DESC, id DESC`.
- `random`: a stable 31-bit content key ordered ascending from a SHA-256 seed pivot, wrapping once at the maximum key. The content UUID breaks hash collisions, so a finite unchanged result set contains no duplicates. If omitted, the server returns a generated seed which clients must retain.

The stored hot coordinate is:

```text
sign(providerScore) * min(4, ln(1 + abs(providerScore)))
+ clamp(sourcePriority / 50, -2, 2)
+ publishedEpochHours / 72
```

At response time, `currentEpochHours / 72` is subtracted for the explanation. This gives the equivalent transparent score `boundedProviderSignal + boundedSourcePriority - ageHours / 72`. The request-time term is constant across every item, so materializing the coordinate preserves exact ordering and avoids a full-table recalculation. Provider contribution is bounded to ±4 and priority to ±2.

All modes exclude non-active content, current-user hidden content, and ratings above `content.maximumRating`. The optional requested rating can only narrow that ceiling. Source, media kind, publication range, and tag filters compose with these mandatory restrictions. Attribution is deterministic: the normalized item's stored primary occurrence is returned, media uses lowest ordinal then ID, and details expose all sanitized occurrences without raw provider payloads.

Keyset cursors prevent repeats/skips for a stable result set and ordinary inserts behind the cursor. Newly inserted or updated rows that sort ahead of an already-issued cursor are intentionally visible only after restarting pagination; mutable rows that cross the cursor boundary can be observed according to their new position.

## Performance

M07 adds `ContentItem_feed_new_idx`, `ContentItem_feed_hot_idx`, and `ContentItem_feed_random_idx`. Integration tests load representative rows and use `EXPLAIN` with sequential scans disabled to assert each core ordering path can use its intended index. Filters use existing relation indexes. No query accepts an unbounded page size or computes a random sort for the whole table.
