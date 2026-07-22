# Deduplication, search, and filters

MirthSpool keeps every `SourcePost` and media alternate. A duplicate group changes only
which `ContentItem` is presented as the card; it never deletes an occurrence. The primary
is selected deterministically from active status, usable cached media, resolution, title
completeness, source priority, provider score, then UUID.

## Detection bounds and tradeoffs

Detection proceeds from exact canonical identity and SHA-256 equality to conservative
image similarity. Canonical URLs remove fragments and known tracking parameters but keep
all other query parameters. Static JPEG, PNG, and WebP images only are decoded. Input is
bounded by configured bytes and pixels, Sharp is isolated behind `PerceptualHasher`, and
processing has a five-second default timeout and worker concurrency of one (maximum four).
dHash candidates must be within two percent in both dimensions and at most four bits apart;
only 100 candidates are inspected by default (maximum 500). Animated images, SVG, video,
unknown formats, oversized inputs, and decode failures are skipped safely.

These settings prefer false negatives over false merges. Crops, overlays, and resized images
outside the dimension window may remain separate. Similar flat artwork can still collide,
so the admin duplicate page exposes reasons and distances and provides audited merge/split.

## Search contract

`GET /api/search` accepts a 200-character query with at most 20 Unicode word/number tokens.
Punctuation-only text becomes an empty browse query. Repeatable source, media-kind, rating,
and tag filters compose with date, favorite, seen, and admin-only hidden filters. The UI
stores all filter state in the URL. Queries use bound Prisma SQL values, a generated
`tsvector`, a GIN index, signed cursor fingerprints, and a 60-request/minute user/IP limit.
The configured rating ceiling and hidden rules apply to both feed and search.

Provider categories and hashtags become normalized `PROVIDER` tags. Administrator tag
repository operations are source-scoped, authenticated by their caller, refresh the search
document, and append an audit event. They cannot create or upload media.

## Representative performance procedure

Run the deterministic, idempotent fixture only against a disposable database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/generate-representative-data.sql
```

It creates 100,000 content items, 150,000 source posts, 120,000 media assets, 25,000
actions, and 1,000 tags under an `m14-*` namespace. Capture plans with:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM "ContentItem"
WHERE status = 'ACTIVE' AND "duplicatePrimary" = true
ORDER BY "publishedAt" DESC, id DESC LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM "ContentItem"
WHERE "searchVector" @@ websearch_to_tsquery('simple', 'item-4242')
ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('simple', 'item-4242')) DESC,
  "publishedAt" DESC, id DESC LIMIT 50;
```

The integration suite asserts the deduplicated feed and GIN search indexes appear in JSON
plans with sequential scans disabled, avoiding timing-sensitive CI thresholds. Migration
rollback requires dropping the generated `searchVector` column and M14 indexes/constraints,
then dropping `duplicateAnalyzedAt` and `duplicatePrimary`; take a database backup first.

On the full fixture in the Ubuntu development VM, the feed plan used
`ContentItem_feed_new_idx` and returned 50 rows in 0.713 ms. A deliberately broad query
matching all 100,000 rows used a parallel scan and completed in 3.968 seconds; this is the
documented worst case. The selective `item-4242` plan used
`ContentItem_search_vector_idx` and completed in 7.720 ms. Exact timings vary with host and
cache state.
