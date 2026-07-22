-- M07 feed keys are materialized so requests never sort an unbounded computed expression.
ALTER TABLE "ContentItem" ADD COLUMN "randomKey" INTEGER NOT NULL DEFAULT 0;

-- Stable 31-bit key derived only from the content UUID. Collisions are resolved by id.
UPDATE "ContentItem"
SET "randomKey" = (('x' || substr(md5("id"::text), 1, 8))::bit(32)::bigint & 2147483647)::integer;

-- Existing rows receive the same hot coordinate used by ingestion. At request time the
-- explanation subtracts current epoch-hours / 72, a constant that does not change ordering.
UPDATE "ContentItem" c
SET "rankingScore" =
  CASE WHEN sp."providerScore" IS NULL THEN 0
       ELSE sign(sp."providerScore") * LEAST(4.0, ln(1 + abs(sp."providerScore"))) END
  + LEAST(2.0, GREATEST(-2.0, s."priority" / 50.0))
  + extract(epoch from c."publishedAt") / 3600.0 / 72.0
FROM "SourcePost" sp
JOIN "Source" s ON s."id" = sp."sourceId"
WHERE sp."id" = c."primarySourcePostId";

DROP INDEX IF EXISTS "ContentItem_status_publishedAt_idx";
DROP INDEX IF EXISTS "ContentItem_rankingScore_publishedAt_idx";
CREATE INDEX "ContentItem_feed_new_idx" ON "ContentItem" ("status", "publishedAt" DESC, "id" DESC);
CREATE INDEX "ContentItem_feed_hot_idx" ON "ContentItem" ("status", "rankingScore" DESC, "publishedAt" DESC, "id" DESC);
CREATE INDEX "ContentItem_feed_random_idx" ON "ContentItem" ("status", "randomKey", "id");

-- Rollback: drop the three *_feed_* indexes and randomKey column, then recreate the
-- two prior indexes. The UPDATEs are bounded by the ContentItem table; deploy during
-- a maintenance window for large installations because PostgreSQL ALTER/CREATE INDEX
-- acquire table locks (future large deployments should use an online migration).
