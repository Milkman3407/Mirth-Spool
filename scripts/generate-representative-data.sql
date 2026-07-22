-- Opt-in deterministic M14 performance fixture. Safe to rerun; it never deletes data.
BEGIN;
SELECT pg_advisory_xact_lock(2147031015);

CREATE OR REPLACE FUNCTION pg_temp.mirth_uuid(value text) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT (substr(md5(value),1,8)||'-'||substr(md5(value),9,4)||'-4'||
    substr(md5(value),14,3)||'-8'||substr(md5(value),18,3)||'-'||
    substr(md5(value),21,12))::uuid
$$;

INSERT INTO "User" (id, email, "emailNormalized", name, role, "updatedAt")
VALUES (pg_temp.mirth_uuid('m14-user'), 'm14-load@example.invalid',
  'm14-load@example.invalid', 'M14 representative user', 'ADMIN', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "Source" (id, kind, "displayName", "configJson", "updatedAt")
SELECT pg_temp.mirth_uuid('m14-source-' || g),
  (ARRAY['RSS','LEMMY','MASTODON','REDDIT']::"SourceKind"[])[g],
  'M14 source ' || g, '{}'::jsonb, now()
FROM generate_series(1, 4) g ON CONFLICT (id) DO NOTHING;

INSERT INTO "ContentItem" (id, title, "normalizedTitle", "authorName",
  "contentRating", status, "publishedAt", "randomKey", "rankingScore",
  "searchText", "duplicateAnalyzedAt", "updatedAt")
SELECT pg_temp.mirth_uuid('m14-content-' || g), 'Representative mirth ' || g,
  'representative mirth ' || g, 'author-' || (g % 500),
  (ARRAY['SAFE','SAFE','SENSITIVE','UNKNOWN']::"ContentRating"[])[1 + (g % 4)],
  'ACTIVE', timestamptz '2026-01-01 00:00:00+00' + (g || ' seconds')::interval,
  (g * 2654435761 % 2147483647)::integer, (g % 10000)::double precision,
  'representative mirth item-' || g || ' author-' || (g % 500) ||
    ' community-' || (g % 200),
  now(), now()
FROM generate_series(1, 100000) g ON CONFLICT (id) DO NOTHING;

INSERT INTO "SourcePost" (id, "sourceId", "contentItemId", "externalId",
  "providerUrl", "providerAuthor", "communityName", "providerPublishedAt")
SELECT pg_temp.mirth_uuid('m14-post-' || g),
  pg_temp.mirth_uuid('m14-source-' || (1 + (g % 4))),
  pg_temp.mirth_uuid('m14-content-' || (1 + ((g - 1) % 100000))),
  'm14-' || g, 'https://example.invalid/m14/' || g,
  'author-' || (g % 500), 'community-' || (g % 200),
  timestamptz '2026-01-01 00:00:00+00' + (g || ' seconds')::interval
FROM generate_series(1, 150000) g ON CONFLICT (id) DO NOTHING;

INSERT INTO "MediaAsset" (id, "contentItemId", ordinal, kind, "remoteUrl", "updatedAt")
SELECT pg_temp.mirth_uuid('m14-media-' || g),
  pg_temp.mirth_uuid('m14-content-' || (1 + ((g - 1) % 100000))),
  CASE WHEN g <= 100000 THEN 0 ELSE 1 END,
  (ARRAY['IMAGE','VIDEO','LINK']::"MediaKind"[])[1 + (g % 3)],
  'https://example.invalid/m14/media/' || g, now()
FROM generate_series(1, 120000) g ON CONFLICT (id) DO NOTHING;

INSERT INTO "Tag" (id, slug, label, "updatedAt")
SELECT pg_temp.mirth_uuid('m14-tag-' || g), 'm14-tag-' || g, 'M14 tag ' || g, now()
FROM generate_series(1, 1000) g ON CONFLICT (id) DO NOTHING;

INSERT INTO "ContentTag" ("contentItemId", "tagId", source)
SELECT pg_temp.mirth_uuid('m14-content-' || g),
  pg_temp.mirth_uuid('m14-tag-' || (1 + (g % 1000))), 'PROVIDER'
FROM generate_series(1, 100000) g ON CONFLICT DO NOTHING;

INSERT INTO "UserAction" (id, "userId", "contentItemId", kind)
SELECT pg_temp.mirth_uuid('m14-action-' || g), pg_temp.mirth_uuid('m14-user'),
  pg_temp.mirth_uuid('m14-content-' || g),
  (ARRAY['VIEW','FAVORITE','HIDE']::"ActionKind"[])[1 + (g % 3)]
FROM generate_series(1, 25000) g ON CONFLICT (id) DO NOTHING;

ANALYZE "ContentItem";
ANALYZE "SourcePost";
ANALYZE "MediaAsset";
ANALYZE "UserAction";
ANALYZE "Tag";
COMMIT;
