-- M14 adds online duplicate-analysis state and a PostgreSQL full-text vector.
-- Existing rows remain standalone feed primaries until the bounded worker
-- analyzes them. The search document is backfilled from local content fields;
-- the worker later enriches it with source/community/tag provenance.

ALTER TABLE "ContentItem"
  ADD COLUMN "duplicatePrimary" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "duplicateAnalyzedAt" TIMESTAMPTZ(3);

ALTER TABLE "DuplicateGroup"
  ADD COLUMN "primaryContentId" UUID;

CREATE UNIQUE INDEX "DuplicateGroup_primaryContentId_key"
  ON "DuplicateGroup"("primaryContentId");

ALTER TABLE "DuplicateGroup"
  ADD CONSTRAINT "DuplicateGroup_primaryContentId_fkey"
  FOREIGN KEY ("primaryContentId") REFERENCES "ContentItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "ContentItem"
SET "searchText" = trim(concat_ws(
  ' ',
  "title",
  "normalizedTitle",
  "authorName",
  "summary"
));

ALTER TABLE "ContentItem"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce("searchText", ''))
  ) STORED;

CREATE INDEX "ContentItem_search_vector_idx"
  ON "ContentItem" USING GIN ("searchVector");

CREATE INDEX "ContentItem_duplicate_analysis_idx"
  ON "ContentItem"("duplicateAnalyzedAt", "updatedAt");

CREATE INDEX "ContentItem_deduplicated_feed_idx"
  ON "ContentItem"("duplicatePrimary", "status", "publishedAt" DESC, "id" DESC);

CREATE INDEX "ContentItem_canonical_candidate_idx"
  ON "ContentItem"("canonicalUrlHash", "id")
  WHERE "canonicalUrlHash" IS NOT NULL;

CREATE INDEX "MediaAsset_perceptual_candidate_idx"
  ON "MediaAsset"("kind", "width", "height", "id")
  WHERE "perceptualHash" IS NOT NULL;
