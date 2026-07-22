-- M11 adds nullable Mastodon attribution and counter fields. PostgreSQL can add
-- these columns without a table rewrite and existing source occurrences require
-- no backfill. No new index is needed because these diagnostic fields are not
-- used for filtering or ordering in M11.
ALTER TABLE "SourcePost"
  ADD COLUMN "boostedBy" TEXT,
  ADD COLUMN "providerFavouriteCount" INTEGER,
  ADD COLUMN "providerShareCount" INTEGER,
  ADD COLUMN "providerLanguage" TEXT;

-- Media descriptions are normalized to bounded plain text by connectors and
-- retained for accessible rendering. Existing media remains valid with NULL.
ALTER TABLE "MediaAsset"
  ADD COLUMN "altText" TEXT;

-- Rollback (only before any application version depends on these fields):
-- ALTER TABLE "SourcePost"
--   DROP COLUMN "boostedBy",
--   DROP COLUMN "providerFavouriteCount",
--   DROP COLUMN "providerShareCount",
--   DROP COLUMN "providerLanguage";
-- ALTER TABLE "MediaAsset" DROP COLUMN "altText";
